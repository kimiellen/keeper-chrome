export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  allFrames: true,
  main(ctx) {
    const KEEPER_FILL_REQUEST = '__KEEPER_FILL_REQUEST__';

    const onFrameMessage = (event: MessageEvent) => {
      if (event.data && (event.data as Record<string, unknown>).type === KEEPER_FILL_REQUEST) {
        void handleFillFromShortcut();
      }
    };
    window.addEventListener('message', onFrameMessage);
    ctx.onInvalidated(() => {
      window.removeEventListener('message', onFrameMessage);
    });

    interface MatchingAccount {
      id: number;
      username: string;
      password?: string;
    }

    interface MatchingBookmark {
      bookmarkId: string;
      name: string;
      accounts: MatchingAccount[];
    }

    interface AuthStatusResponse {
      locked: boolean;
    }

    interface MatchingBookmarksResponse {
      bookmarks: MatchingBookmark[];
    }

    interface AccountChoice {
      bookmarkId: string;
      bookmarkName: string;
      account: MatchingAccount;
    }

    interface DropdownHandle {
      host: HTMLDivElement;
      onOutsideClick: (event: MouseEvent) => void;
      onKeyNav: (event: KeyboardEvent) => void;
      selectedIndex: number;
      items: HTMLButtonElement[];
    }

    let activeDropdown: DropdownHandle | null = null;

    const FILL_ANIMATION_CLASS = "keeper-animated-fill";
    const FILL_ANIMATION_DURATION = 300;

    function injectFillAnimationStyle(): HTMLStyleElement | null {
      if (!document.head) {
        return null;
      }

      const style = document.createElement("style");
      style.textContent = `
        @keyframes keeperfill {
          0% { transform: scale(1, 1); }
          40% { transform: scale(1.06, 1.10); }
          100% { transform: scale(1, 1); }
        }
        .${FILL_ANIMATION_CLASS} {
          animation: keeperfill ${FILL_ANIMATION_DURATION}ms ease-in-out 0ms 1;
        }
        @media (prefers-reduced-motion) {
          .${FILL_ANIMATION_CLASS} {
            animation: none;
          }
        }
      `;

      document.head.appendChild(style);
      return style;
    }

    const fillAnimationStyle = injectFillAnimationStyle();

    function playFillAnimation(field: HTMLInputElement): void {
      field.classList.remove(FILL_ANIMATION_CLASS);
      void field.offsetWidth;
      field.classList.add(FILL_ANIMATION_CLASS);

      setTimeout(() => {
        field.classList.remove(FILL_ANIMATION_CLASS);
      }, FILL_ANIMATION_DURATION);
    }

    /**
     * 安全发送消息到后台脚本。
     */
    async function sendRuntimeMessage<TResponse>(payload: unknown): Promise<TResponse | null> {
      try {
        const response = await browser.runtime.sendMessage(payload);
        return response as TResponse;
      }
      catch {
        return null;
      }
    }

    /**
     * 判断输入框是否可见且可交互。
     */
    function isVisibleInput(input: HTMLInputElement): boolean {
      if (!input.isConnected) {
        return false;
      }

      if (input.type.toLowerCase() === "hidden") {
        return false;
      }

      const style = window.getComputedStyle(input);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      // 检查元素是否有实际尺寸
      const rect = input.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      // 检查元素是否在布局中
      if (input.offsetParent === null) {
        const position = style.position;
        if (position !== "fixed" && position !== "absolute" && position !== "sticky") {
          return false;
        }
      }

      return true;
    }

    /**
     * 判断字段是否处于搜索区域。
     */
    function isInSearchContext(element: HTMLElement): boolean {
      const searchRoleContainer = element.closest('[role="search"]');
      if (searchRoleContainer) {
        return true;
      }

      const form = element.closest("form");
      const action = form?.getAttribute("action") ?? "";
      return action.toLowerCase().includes("search");
    }

    /**
     * 获取当前页面所有可见密码输入框。
     */
    function getVisiblePasswordFields(): HTMLInputElement[] {
      const passwordFields = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'));
      return passwordFields.filter((field) => isVisibleInput(field) && !isInSearchContext(field));
    }

    /**
     * 依据启发式选择最合适的用户名字段。
     */
    function chooseBestUsernameCandidate(passwordField: HTMLInputElement, candidates: HTMLInputElement[]): HTMLInputElement | null {
      if (candidates.length === 0) {
        return null;
      }

      const byAutocomplete = candidates.find((candidate) => candidate.autocomplete.toLowerCase() === "username");
      if (byAutocomplete) {
        return byAutocomplete;
      }

      const precedingCandidates = candidates.filter((candidate) => {
        const relation = candidate.compareDocumentPosition(passwordField);
        return (relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });

      if (precedingCandidates.length > 0) {
        return precedingCandidates[precedingCandidates.length - 1] ?? null;
      }

      return candidates[0] ?? null;
    }

    /**
     * 在给定容器内查找可见用户名候选字段。
     */
    function findUsernameCandidates(scope: ParentNode, passwordField: HTMLInputElement): HTMLInputElement[] {
      const selector = [
        'input[type="email"]',
        'input[type="text"]',
        'input[type="tel"]',
        'input[name*="user" i]',
        'input[name*="email" i]',
        'input[name*="login" i]',
        'input[name*="account" i]',
        'input[id*="user" i]',
        'input[id*="email" i]',
        'input[id*="account" i]',
        'input[autocomplete="username"]',
        'input[autocomplete="email"]',
        // 华为特定选择器
        'input.userAccount',
        'input[placeholder*="手机" i]',
        'input[placeholder*="账号" i]',
        'input[placeholder*="邮件" i]',
      ].join(",");

      const candidates = Array.from(scope.querySelectorAll<HTMLInputElement>(selector));
      return candidates.filter((candidate) => {
        if (candidate === passwordField) {
          return false;
        }

        if (!isVisibleInput(candidate)) {
          return false;
        }

        if (isInSearchContext(candidate)) {
          return false;
        }

        return true;
      });
    }

    /**
     * 按规则为密码字段寻找对应用户名字段。
     */
    function findUsernameField(passwordField: HTMLInputElement): HTMLInputElement | null {
      const form = passwordField.closest("form");
      if (form && !isInSearchContext(passwordField)) {
        const inFormCandidates = findUsernameCandidates(form, passwordField);
        const selectedInForm = chooseBestUsernameCandidate(passwordField, inFormCandidates);
        if (selectedInForm) {
          return selectedInForm;
        }
      }

      let ancestor: HTMLElement | null = passwordField.parentElement;
      let depth = 0;
      while (ancestor && depth < 10) {
        const scopedCandidates = findUsernameCandidates(ancestor, passwordField);
        if (scopedCandidates.length > 0) {
          const selectedInAncestor = chooseBestUsernameCandidate(passwordField, scopedCandidates);
          if (selectedInAncestor) {
            return selectedInAncestor;
          }
        }
        ancestor = ancestor.parentElement;
        depth++;
      }

      const globalCandidates = findUsernameCandidates(document, passwordField);
      return chooseBestUsernameCandidate(passwordField, globalCandidates);
    }

    /**
     * 设置字段值并触发前端框架所需事件。
     */
    const KEEPER_FILLED_ATTR = "data-keeper-filled";

    function setFieldValue(field: HTMLInputElement, value: string): void {
      field.focus();
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      playFillAnimation(field);

      if (field.type.toLowerCase() === "password") {
        field.setAttribute(KEEPER_FILLED_ATTR, "1");

        const onManualInput = (): void => {
          field.removeAttribute(KEEPER_FILLED_ATTR);
          field.removeEventListener("input", onManualInput);
        };
        field.addEventListener("input", onManualInput);
      }
    }

    /**
     * 读取鉴权状态，锁定时禁用自动填充。
     */
    async function isUnlocked(): Promise<boolean> {
      const auth = await sendRuntimeMessage<AuthStatusResponse>({ type: "GET_AUTH_STATUS" });
      return Boolean(auth && !auth.locked);
    }

    /**
     * 按当前 URL 获取可匹配书签列表。
     */
    async function getMatchingBookmarks(): Promise<MatchingBookmark[]> {
      const unlocked = await isUnlocked();
      if (!unlocked) {
        return [];
      }

      const response = await sendRuntimeMessage<MatchingBookmarksResponse>({
        type: "GET_MATCHING_BOOKMARKS",
        payload: {
          url: window.location.href,
        },
      });

      return response?.bookmarks ?? [];
    }

    /**
     * 关闭账号选择下拉层。
     */
    function closeAccountDropdown(): void {
      if (!activeDropdown) {
        return;
      }

      document.removeEventListener("mousedown", activeDropdown.onOutsideClick, true);
      document.removeEventListener("keydown", activeDropdown.onKeyNav, true);
      activeDropdown.host.remove();
      activeDropdown = null;
    }

    function delay(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * 获取当前页面所有可见的用户名候选框（仅在无密码框时使用）。
     * 只匹配有明确登录语义的输入框，不匹配通用 text 输入框。
     */
    function getVisibleUsernameOnlyFields(): HTMLInputElement[] {
      const selector = [
        'input[type="email"]',
        'input[type="text"]',
        'input[type="tel"]',
        'input[name*="user" i]',
        'input[name*="email" i]',
        'input[name*="login" i]',
        'input[name*="account" i]',
        'input[id*="user" i]',
        'input[id*="email" i]',
        'input[id*="account" i]',
        'input[autocomplete="username"]',
        'input[autocomplete="email"]',
        // 华为特定选择器
        'input.userAccount',
        'input[placeholder*="手机" i]',
        'input[placeholder*="账号" i]',
        'input[placeholder*="邮件" i]',
      ].join(",");

      return Array.from(document.querySelectorAll<HTMLInputElement>(selector)).filter(
        (field) => isVisibleInput(field) && !isInSearchContext(field),
      );
    }

    function findSubmitButton(anchorField: HTMLInputElement): HTMLButtonElement | HTMLInputElement | null {
      const form = anchorField.closest("form");
      if (form) {
        const submitInForm =
          form.querySelector<HTMLButtonElement | HTMLInputElement>(
            'button[type="submit"], input[type="submit"]',
          ) ??
          form.querySelector<HTMLButtonElement>("button:not([type='button']):not([type='reset'])");
        if (submitInForm) {
          return submitInForm;
        }
      }

      const NEXT_LABELS = /next|continue|proceed|下一步|继续|sign\s*in|log\s*in|登录|登入/i;

      let ancestor: HTMLElement | null = anchorField.parentElement;
      while (ancestor) {
        const buttons = Array.from(
          ancestor.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
            'button, input[type="submit"]',
          ),
        );
        const match = buttons.find((btn) => NEXT_LABELS.test(btn.textContent ?? btn.getAttribute("value") ?? ""));
        if (match) {
          return match;
        }
        ancestor = ancestor.parentElement;
      }

      return null;
    }

    function waitForPasswordField(timeoutMs: number): Promise<HTMLInputElement | null> {
      return new Promise((resolve) => {
        const existing = getVisiblePasswordFields();
        if (existing.length > 0) {
          resolve(existing[0]);
          return;
        }

        const timer = window.setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeoutMs);

        const observer = new MutationObserver(() => {
          const fields = getVisiblePasswordFields();
          if (fields.length > 0) {
            window.clearTimeout(timer);
            observer.disconnect();
            resolve(fields[0]);
          }
        });

        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["type", "style", "class"] });
      });
    }

    async function fillCredentials(
      anchorField: HTMLInputElement,
      choice: AccountChoice,
      isTwoStep: boolean = false,
    ): Promise<void> {
      const username = choice.account.username ?? "";
      
      // 按需解密密码
      let password = "";
      try {
        const response = await browser.runtime.sendMessage({
          type: 'GET_DECRYPTED_PASSWORD',
          payload: {
            bookmarkId: choice.bookmarkId,
            accountId: choice.account.id,
          },
        }) as { password?: string; error?: string; locked?: boolean };
        
        if (response.locked) {
          showNotification('请先解锁 Keeper');
          return;
        }
        if (response.error) {
          console.error('[Keeper:content] Failed to decrypt password:', response.error);
          showNotification('解密密码失败');
          return;
        }
        password = response.password ?? "";
      } catch (error) {
        console.error('[Keeper:content] Error requesting decrypted password:', error);
        showNotification('获取密码失败');
        return;
      }

      if (isTwoStep) {
        if (username) {
          setFieldValue(anchorField, username);
          await delay(FILL_ANIMATION_DURATION + 100);

          // 先尝试在当前页面直接查找密码框（单页同时显示用户名密码的场景）
          if (password) {
            const existingPasswordField = getVisiblePasswordFields()[0] ?? null;
            if (existingPasswordField) {
              await delay(200);
              setFieldValue(existingPasswordField, password);
            } else {
              // 当前页面没有密码框，才是真正的分步登录，点击提交等待下一步
              const submitBtn = findSubmitButton(anchorField);
              if (submitBtn) {
                submitBtn.click();
                const passwordField = await waitForPasswordField(5000);
                if (passwordField) {
                  await delay(200);
                  setFieldValue(passwordField, password);
                }
              }
            }
          }
        }
      } else {
        // 非 two-step 模式：同时有用户名和密码字段
        const anchorType = anchorField.type.toLowerCase();
        
        if (anchorType === 'password') {
          // anchor 是密码字段，查找用户名字段
          const usernameField = findUsernameField(anchorField);
          if (usernameField && username) {
            setFieldValue(usernameField, username);
            if (password) {
              await delay(FILL_ANIMATION_DURATION + 100);
            }
          }
          if (password) {
            setFieldValue(anchorField, password);
          }
        } else {
          // anchor 是用户名字段（text/email/tel），直接使用它
          if (username) {
            setFieldValue(anchorField, username);
          }
          if (password) {
            await delay(FILL_ANIMATION_DURATION + 100);
            const passwordField = getVisiblePasswordFields()[0];
            if (passwordField) {
              setFieldValue(passwordField, password);
            }
          }
        }
      }

      await sendRuntimeMessage<{ success: boolean }>({
        type: "MARK_AS_USED",
        bookmarkId: choice.bookmarkId,
        url: window.location.href,
        accountId: choice.account.id,
      });
    }

    function showAccountDropdown(anchorField: HTMLInputElement, choices: AccountChoice[], isTwoStep: boolean = false): void {
      closeAccountDropdown();

      const host = document.createElement("div");
      host.style.cssText = [
        "position: fixed",
        "inset: 0",
        "z-index: 2147483647",
        "display: flex",
        "align-items: center",
        "justify-content: center",
        "pointer-events: none",
      ].join(";");
      document.body.append(host);

      const shadowRoot = host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = `
        .keeper-dropdown {
          pointer-events: auto;
          min-width: 240px;
          max-width: 360px;
          width: max-content;
          background: #ffffff;
          border: 1px solid #dcdfe6;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
          padding: 8px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .keeper-item {
          display: block;
          width: 100%;
          box-sizing: border-box;
          padding: 8px 16px;
          border: 1px solid #dcdfe6;
          border-radius: 4px;
          background: #ffffff;
          color: #606266;
          font-size: 13px;
          line-height: 1.5;
          text-align: center;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
          outline: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .keeper-item:hover {
          background: #ecf5ff;
          border-color: #409eff;
          color: #409eff;
        }
        .keeper-item.is-selected {
          background: #409eff;
          border-color: #409eff;
          color: #ffffff;
        }
      `;

      const container = document.createElement("div");
      container.className = "keeper-dropdown";
      container.addEventListener("mousedown", (e) => e.stopPropagation());

      const itemEls: HTMLButtonElement[] = [];

      for (const choice of choices) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "keeper-item";
        item.textContent = choice.account.username;
        item.dataset.index = String(itemEls.length);

        item.addEventListener("click", async () => {
          closeAccountDropdown();
          await fillCredentials(anchorField, choice, isTwoStep);
        });

        container.append(item);
        itemEls.push(item);
      }

      let selectedIndex = 0;
      function applyHighlight(index: number): void {
        itemEls.forEach((el, i) => {
          el.classList.toggle("is-selected", i === index);
        });
        itemEls[index]?.scrollIntoView({ block: "nearest" });
      }
      applyHighlight(selectedIndex);

      shadowRoot.append(style, container);

      const onOutsideClick = (event: MouseEvent) => {
        const composedPath = event.composedPath();
        if (composedPath.includes(host)) {
          return;
        }
        closeAccountDropdown();
      };

      const onKeyNav = (event: KeyboardEvent) => {
        if (!activeDropdown) {
          return;
        }

        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            selectedIndex = (selectedIndex + 1) % itemEls.length;
            activeDropdown.selectedIndex = selectedIndex;
            applyHighlight(selectedIndex);
            break;

          case "ArrowUp":
            event.preventDefault();
            selectedIndex = (selectedIndex - 1 + itemEls.length) % itemEls.length;
            activeDropdown.selectedIndex = selectedIndex;
            applyHighlight(selectedIndex);
            break;

          case "Enter": {
            event.preventDefault();
            const chosen = choices[selectedIndex];
            if (chosen) {
              closeAccountDropdown();
              void fillCredentials(anchorField, chosen, isTwoStep);
            }
            break;
          }

          case "Escape":
            event.preventDefault();
            closeAccountDropdown();
            break;

          default:
            break;
        }
      };

      document.addEventListener("mousedown", onOutsideClick, true);
      document.addEventListener("keydown", onKeyNav, true);
      activeDropdown = { host, onOutsideClick, onKeyNav, selectedIndex, items: itemEls };
    }

    /**
     * 处理快捷键触发的账号填充。
     */
    async function handleFillFromShortcut(): Promise<void> {
      let anchorField: HTMLInputElement | null = null;
      let isTwoStep = false;

      // 1. 优先使用当前聚焦元素（用户按 Alt+P 时通常已聚焦输入框）
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement && activeElement.type !== 'hidden') {
        const activeType = activeElement.type.toLowerCase();
        if (activeType === 'password') {
          anchorField = activeElement;
        } else if (['email', 'text', 'tel'].includes(activeType) && !isInSearchContext(activeElement)) {
          anchorField = activeElement;
          // 只有在当前页面没有密码字段时才认为是分步登录
          const hasPasswordField = getVisiblePasswordFields().length > 0;
          isTwoStep = !hasPasswordField;
        }
      }

      // 2. 没有聚焦元素时，回退到 DOM 扫描
      if (!anchorField) {
        const passwordFields = getVisiblePasswordFields();
        if (passwordFields.length > 0) {
          anchorField = passwordFields[0];
        } else {
          const usernameFields = getVisibleUsernameOnlyFields();
          if (usernameFields.length === 0) {
            if (window.top === window && window.frames.length > 0) {
              for (let i = 0; i < window.frames.length; i++) {
                try {
                  window.frames[i]?.postMessage({ type: KEEPER_FILL_REQUEST }, '*');
                } catch {
                  // 跨域 iframe 会抛出安全错误，忽略即可
                }
              }
            }
            return;
          }
          anchorField = usernameFields[0];
          isTwoStep = true;
        }
      }

      const bookmarks = await getMatchingBookmarks();
      if (bookmarks.length === 0) {
        return;
      }

      const choices: AccountChoice[] = [];
      for (const bookmark of bookmarks) {
        for (const account of bookmark.accounts) {
          choices.push({
            bookmarkId: bookmark.bookmarkId,
            bookmarkName: bookmark.name,
            account,
          });
        }
      }

      if (choices.length === 0) {
        return;
      }

      if (choices.length === 1) {
        await fillCredentials(anchorField, choices[0], isTwoStep);
        return;
      }

      showAccountDropdown(anchorField, choices, isTwoStep);
    }

    const onRuntimeMessage = async (message: unknown) => {
      if (!message || typeof message !== "object") {
        return;
      }

      const msg = message as Record<string, unknown>;

      if (msg.type === "FILL_FROM_SHORTCUT") {
        await handleFillFromShortcut();
        return;
      }

    };

    browser.runtime.onMessage.addListener(onRuntimeMessage);

    ctx.onInvalidated(() => {
      closeAccountDropdown();
      fillAnimationStyle?.remove();
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
    });
  },
});
