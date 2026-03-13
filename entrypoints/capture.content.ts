export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    if (window.top !== window) {
      return;
    }

    type ExtractedCredential = {
      username: string;
      password: string;
    };

    type BookmarkAccount = {
      username?: string;
      password?: string;
    };

    type BookmarkItem = {
      accounts?: BookmarkAccount[];
    };

    const KEEPER_FILLED_ATTR = 'data-keeper-filled';

    /** 凭据检查结果：不存在 / 已存在且密码相同 / 已存在但密码不同 */
    type CredentialCheckResult = 'not_found' | 'same_password' | 'different_password';

    const capturedSessionKeys = new Set<string>();
    const observedForms = new WeakSet<HTMLFormElement>();
    const listenerCleanups: Array<() => void> = [];

    let lastPasswordInteraction = 0;
    let lastInteractedForm: HTMLFormElement | null = null;

    /**
     * 记忆最近输入过的用户名，用于支持多步骤登录表单。
     * 当用户名和密码在不同页面/步骤输入时，密码步骤可能找不到用户名字段，
     * 此时使用该缓存值。
     * 使用 sessionStorage 持久化，防止页面导航或 content script 重新注入后丢失。
     */
    const REMEMBERED_USERNAME_KEY = '__keeper_remembered_username__';
    const REMEMBERED_USERNAME_TS_KEY = '__keeper_remembered_username_ts__';
    /** 记忆用户名的有效期（5 分钟） */
    const REMEMBERED_USERNAME_TTL = 5 * 60 * 1000;

    const loadRememberedUsername = (): { value: string; timestamp: number } => {
      try {
        const value = sessionStorage.getItem(REMEMBERED_USERNAME_KEY) ?? '';
        const timestamp = Number(sessionStorage.getItem(REMEMBERED_USERNAME_TS_KEY) ?? '0');
        return { value, timestamp };
      } catch {
        return { value: '', timestamp: 0 };
      }
    };

    const saveRememberedUsername = (username: string): void => {
      try {
        sessionStorage.setItem(REMEMBERED_USERNAME_KEY, username);
        sessionStorage.setItem(REMEMBERED_USERNAME_TS_KEY, String(Date.now()));
      } catch {
        // sessionStorage 不可用时静默降级
      }
    };

    const getRememberedUsername = (): string => {
      const { value, timestamp } = loadRememberedUsername();
      if (value && Date.now() - timestamp < REMEMBERED_USERNAME_TTL) {
        return value;
      }
      return '';
    };

    let observer: MutationObserver | null = null;
    let observerTimer: number | null = null;

    let activeBarHost: HTMLDivElement | null = null;
    let dismissActiveBar: (() => void) | null = null;

    const ignoredFieldKeywords = [
      'search',
      'query',
      'filter',
      'otp',
      'code',
      'token',
      '2fa',
      'totp',
      'pin',
    ];

    /**
     * 统一注册事件并在失效时自动清理。
     */
    const bindEvent = <K extends keyof DocumentEventMap>(
      target: Document,
      type: K,
      listener: (event: DocumentEventMap[K]) => void,
      options?: AddEventListenerOptions | boolean,
    ): void => {
      target.addEventListener(type, listener as EventListener, options);
      listenerCleanups.push(() => {
        target.removeEventListener(type, listener as EventListener, options);
      });
    };

    /**
     * 表单 action 或容器语义是否为搜索类表单。
     */
    const isSearchLikeForm = (form: HTMLFormElement): boolean => {
      const action = (form.getAttribute('action') ?? '').toLowerCase();
      if (action.includes('search') || action.includes('query') || action.includes('find')) {
        return true;
      }
      return form.closest('[role="search"]') !== null;
    };

    /**
     * 输入框名字是否命中应排除的关键字。
     */
    const hasIgnoredFieldKeyword = (value: string): boolean => {
      const normalized = value.toLowerCase();
      return ignoredFieldKeywords.some((keyword) => normalized.includes(keyword));
    };

    /**
     * 按启发式规则查找用户名输入框。
     */
    const findUsernameField = (form: HTMLFormElement): HTMLInputElement | null => {
      const selectors = [
        'input[autocomplete="username"]',
        'input[type="email"]',
        'input[name*="user" i]',
        'input[name*="email" i]',
        'input[name*="login" i]',
        'input[type="text"]',
      ];

      for (const selector of selectors) {
        const candidate = form.querySelector<HTMLInputElement>(selector);
        if (candidate && !candidate.disabled && candidate.type !== 'hidden') {
          return candidate;
        }
      }

      return null;
    };

    /**
     * 判断密码值是否更像一次性验证码。
     */
    const looksLikeOtp = (password: string): boolean => {
      return /^\d+$/.test(password) && password.length <= 6;
    };

    /**
     * 根据规则选择本次应采集的密码输入框。
     */
    const pickPasswordField = (form: HTMLFormElement): HTMLInputElement | null => {
      const passwordFields = Array.from(
        form.querySelectorAll<HTMLInputElement>('input[type="password"]'),
      );

      if (passwordFields.length === 0) {
        return null;
      }

      const currentPasswordField = passwordFields.find(
        (field) => field.autocomplete.toLowerCase() === 'current-password',
      );
      const newPasswordField = passwordFields.find(
        (field) => field.autocomplete.toLowerCase() === 'new-password',
      );

      if (currentPasswordField && newPasswordField) {
        return newPasswordField;
      }

      for (const field of passwordFields) {
        const fieldIdentity = `${field.name} ${field.id}`;
        if (hasIgnoredFieldKeyword(fieldIdentity)) {
          continue;
        }
        if (field.hasAttribute(KEEPER_FILLED_ATTR)) {
          continue;
        }
        return field;
      }

      return null;
    };

    /**
     * 从指定表单提取有效凭据；不满足规则时返回 null。
     */
    const extractCredentialsFromForm = (form: HTMLFormElement): ExtractedCredential | null => {
      if (isSearchLikeForm(form)) {
        return null;
      }

      const passwordField = pickPasswordField(form);
      if (!passwordField) {
        return null;
      }

      const passwordIdentity = `${passwordField.name} ${passwordField.id}`;
      if (hasIgnoredFieldKeyword(passwordIdentity)) {
        return null;
      }

      const password = passwordField.value.trim();
      if (password.length < 4 || looksLikeOtp(password)) {
        return null;
      }

      const usernameField = findUsernameField(form);
      let username = usernameField?.value.trim() ?? '';

      if (!username) {
        const remembered = getRememberedUsername();
        if (remembered) {
          username = remembered;
        }
      }

      if (!username) {
        return null;
      }

      return { username, password };
    };

    /**
     * 在整个页面范围内搜索可见密码字段和用户名字段，用于无 <form> 包裹的场景。
     * 多步骤登录（如 NAS 管理界面）或 SPA 中密码字段可能不在 form 标签内。
     */
    const extractCredentialsFromPage = (): ExtractedCredential | null => {
      const passwordFields = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="password"]'),
      ).filter(
        (field) => !field.disabled && field.type !== 'hidden' && field.offsetParent !== null,
      );

      if (passwordFields.length === 0) {
        return null;
      }

      let selectedPasswordField: HTMLInputElement | null = null;
      for (const field of passwordFields) {
        const fieldIdentity = `${field.name} ${field.id}`;
        if (hasIgnoredFieldKeyword(fieldIdentity)) {
          continue;
        }
        if (field.hasAttribute(KEEPER_FILLED_ATTR)) {
          continue;
        }
        selectedPasswordField = field;
        break;
      }

      if (!selectedPasswordField) {
        return null;
      }

      const password = selectedPasswordField.value.trim();
      if (password.length < 4 || looksLikeOtp(password)) {
        return null;
      }

      const usernameSelectors = [
        'input[autocomplete="username"]',
        'input[type="email"]',
        'input[name*="user" i]',
        'input[name*="email" i]',
        'input[name*="login" i]',
        'input[type="text"]',
      ];

      let username = '';
      for (const selector of usernameSelectors) {
        const candidate = document.querySelector<HTMLInputElement>(selector);
        if (
          candidate &&
          candidate !== selectedPasswordField &&
          !candidate.disabled &&
          candidate.type !== 'hidden' &&
          candidate.value.trim()
        ) {
          username = candidate.value.trim();
          break;
        }
      }

      if (!username) {
        const remembered = getRememberedUsername();
        if (remembered) {
          username = remembered;
        }
      }

      if (!username) {
        return null;
      }

      return { username, password };
    };

    /**
     * 用户名展示时做长度裁剪，避免通知栏拥挤。
     */
    const truncateUsername = (username: string): string => {
      if (username.length <= 30) {
        return username;
      }
      return `${username.slice(0, 30)}...`;
    };

    /**
     * 移除通知栏并播放上滑动画。
     */
    const removeBarWithAnimation = (
      bar: HTMLDivElement,
      host: HTMLDivElement,
      cleanupRef: { timer: number | null },
    ): void => {
      bar.style.transform = 'translateY(-100%)';
      bar.style.opacity = '0';

      cleanupRef.timer = window.setTimeout(() => {
        if (host.parentNode) {
          host.parentNode.removeChild(host);
        }
      }, 300);
    };

    /**
     * 展示保存/更新凭据通知条，采用 Shadow DOM 隔离样式。
     */
    const showNotificationBar = async (
      username: string,
      password: string,
      isUpdate: boolean,
    ): Promise<void> => {
      if (!document.body) {
        return;
      }

      if (dismissActiveBar) {
        dismissActiveBar();
      }

      const host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.top = '0';
      host.style.left = '0';
      host.style.width = '100%';
      host.style.zIndex = '2147483647';
      host.style.pointerEvents = 'none';

      const shadowRoot = host.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
        }

        .keeper-bar {
          box-sizing: border-box;
          width: 100%;
          pointer-events: auto;
          color: #ffffff;
          font-size: 14px;
          line-height: 1.4;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
          transform: translateY(-100%);
          opacity: 0;
          transition: transform 300ms ease, opacity 300ms ease;
          ${
            isUpdate
              ? 'background: #f59e0b;'
              : 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);'
          }
        }

        .keeper-message {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .keeper-title {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .keeper-username {
          opacity: 0.9;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .keeper-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .keeper-btn {
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.55);
          padding: 6px 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 180ms ease, transform 180ms ease;
        }

        .keeper-btn:hover {
          opacity: 0.92;
          transform: translateY(-1px);
        }

        .keeper-save {
          background: #ffffff;
          color: #0f9d58;
          border-color: #ffffff;
        }

        .keeper-ignore {
          background: transparent;
          color: #ffffff;
        }

        @media (max-width: 640px) {
          .keeper-bar {
            flex-direction: column;
            align-items: flex-start;
          }

          .keeper-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `;

      const bar = document.createElement('div');
      bar.className = 'keeper-bar';

      const messageWrap = document.createElement('div');
      messageWrap.className = 'keeper-message';

      const title = document.createElement('div');
      title.className = 'keeper-title';
      title.textContent = isUpdate
        ? '是否更新 Keeper 中的密码?'
        : '是否将此账号保存到 Keeper?';

      const userText = document.createElement('div');
      userText.className = 'keeper-username';
      userText.textContent = `账号: ${truncateUsername(username)}`;

      const actionWrap = document.createElement('div');
      actionWrap.className = 'keeper-actions';

      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'keeper-btn keeper-save';
      saveButton.textContent = '保存';

      const ignoreButton = document.createElement('button');
      ignoreButton.type = 'button';
      ignoreButton.className = 'keeper-btn keeper-ignore';
      ignoreButton.textContent = '忽略';

      messageWrap.appendChild(title);
      messageWrap.appendChild(userText);
      actionWrap.appendChild(saveButton);
      actionWrap.appendChild(ignoreButton);
      bar.appendChild(messageWrap);
      bar.appendChild(actionWrap);

      shadowRoot.appendChild(style);
      shadowRoot.appendChild(bar);
      document.body.prepend(host);

      activeBarHost = host;

      const cleanupState: { timer: number | null } = { timer: null };

      const dismiss = (): void => {
        if (!activeBarHost) {
          return;
        }

        saveButton.removeEventListener('click', onSave);
        ignoreButton.removeEventListener('click', onIgnore);

        if (cleanupState.timer !== null) {
          window.clearTimeout(cleanupState.timer);
          cleanupState.timer = null;
        }

        removeBarWithAnimation(bar, host, cleanupState);
        activeBarHost = null;
        dismissActiveBar = null;
      };

      const onSave = async (): Promise<void> => {
        try {
          await browser.runtime.sendMessage({
            type: 'SAVE_CREDENTIALS',
            payload: {
              url: window.location.href,
              username,
              password,
            },
          });
        } catch {
          // 忽略保存阶段错误，避免阻断页面交互。
        }
        dismiss();
      };

      const onIgnore = (): void => {
        dismiss();
      };

      saveButton.addEventListener('click', () => {
        void onSave();
      });
      ignoreButton.addEventListener('click', onIgnore);

      dismissActiveBar = dismiss;

      requestAnimationFrame(() => {
        bar.style.transform = 'translateY(0)';
        bar.style.opacity = '1';
      });

      cleanupState.timer = window.setTimeout(() => {
        dismiss();
      }, 15000);
    };

    const checkCredentialStatus = async (
      username: string,
      password: string,
    ): Promise<CredentialCheckResult> => {
      try {
        const response = (await browser.runtime.sendMessage({
          type: 'GET_MATCHING_BOOKMARKS',
          payload: {
            url: window.location.href,
          },
        })) as { bookmarks?: BookmarkItem[] };

        const bookmarks = Array.isArray(response?.bookmarks) ? response.bookmarks : [];
        const normalizedUsername = username.toLowerCase();

        for (const bookmark of bookmarks) {
          const accounts = Array.isArray(bookmark.accounts) ? bookmark.accounts : [];
          for (const account of accounts) {
            const accountUsername = (account.username ?? '').trim().toLowerCase();
            if (accountUsername && accountUsername === normalizedUsername) {
              return account.password === password ? 'same_password' : 'different_password';
            }
          }
        }
      } catch {
        // 查询失败时默认当作新凭据处理
      }

      return 'not_found';
    };

    /**
     * 从表单提取并触发通知展示，自动去重。
     */
    const processFormCredential = async (form: HTMLFormElement | null): Promise<void> => {
      if (!form) {
        return;
      }

      const extracted = extractCredentialsFromForm(form);
      if (!extracted) {
        return;
      }

      const sessionKey = `${window.location.href}::${extracted.username.toLowerCase()}`;
      if (capturedSessionKeys.has(sessionKey)) {
        return;
      }

      capturedSessionKeys.add(sessionKey);

      const status = await checkCredentialStatus(extracted.username, extracted.password);
      if (status === 'same_password') {
        return;
      }

      await showNotificationBar(extracted.username, extracted.password, status === 'different_password');
    };

    /**
     * 无 form 包裹时从整个页面提取凭据并触发通知展示，自动去重。
     */
    const processPageCredential = async (): Promise<void> => {
      const extracted = extractCredentialsFromPage();
      if (!extracted) {
        return;
      }

      const sessionKey = `${window.location.href}::${extracted.username.toLowerCase()}`;
      if (capturedSessionKeys.has(sessionKey)) {
        return;
      }

      capturedSessionKeys.add(sessionKey);

      const status = await checkCredentialStatus(extracted.username, extracted.password);
      if (status === 'same_password') {
        return;
      }

      await showNotificationBar(extracted.username, extracted.password, status === 'different_password');
    };

    /**
     * 监听密码输入相关交互，记录近期行为用于 AJAX 登录判断。
     */
    const onPasswordInteraction = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (target.type !== 'password') {
        return;
      }

      lastPasswordInteraction = Date.now();
      lastInteractedForm = target.form;
    };

    const usernameSelectors = [
      'input[autocomplete="username"]',
      'input[type="email"]',
      'input[name*="user" i]',
      'input[name*="email" i]',
      'input[name*="login" i]',
      'input[name*="account" i]',
    ];

    const isUsernameField = (el: HTMLInputElement): boolean => {
      return usernameSelectors.some((s) => el.matches(s));
    };

    const onUsernameInteraction = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (target.type === 'password' || target.type === 'hidden') {
        return;
      }

      if (!isUsernameField(target)) {
        return;
      }

      const value = target.value.trim();
      if (value) {
        saveRememberedUsername(value);
      }
    };

    /**
     * 处理原生 submit 事件。
     */
    const onDocumentSubmit = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement)) {
        return;
      }

      void processFormCredential(target);
    };

    /**
     * 处理点击提交按钮场景（含 JS 手动提交）。
     */
    const onDocumentClick = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const submitLikeControl = target.closest('button, input[type="submit"], [role="button"]');
      if (!submitLikeControl) {
        return;
      }

      const form = submitLikeControl.closest('form');

      window.setTimeout(() => {
        if (form) {
          void processFormCredential(form);
        } else {
          void processPageCredential();
        }
      }, 0);
    };

    /**
     * 若近期发生密码交互，则在 AJAX 请求发起时尝试捕获凭据。
     */
    const maybeCaptureFromAjax = (): void => {
      if (Date.now() - lastPasswordInteraction > 3000) {
        return;
      }

      const candidateForm =
        lastInteractedForm ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement.closest('form')
          : null);

      if (candidateForm) {
        void processFormCredential(candidateForm);
      } else {
        void processPageCredential();
      }
    };

    /**
     * 给表单补充 submit 捕获监听，适配部分 SPA 行为。
     */
    const attachFormSubmitListener = (form: HTMLFormElement): void => {
      if (observedForms.has(form)) {
        return;
      }

      observedForms.add(form);

      const onSubmit = (): void => {
        void processFormCredential(form);
      };

      form.addEventListener('submit', onSubmit, { capture: true });
      listenerCleanups.push(() => {
        form.removeEventListener('submit', onSubmit, { capture: true });
      });
    };

    /**
     * 扫描并绑定当前页面已有表单。
     */
    const bindExistingForms = (): void => {
      const forms = Array.from(document.querySelectorAll('form'));
      for (const form of forms) {
        if (form instanceof HTMLFormElement) {
          attachFormSubmitListener(form);
        }
      }
    };

    /**
     * 密码字段按 Enter 键时尝试捕获凭据。
     */
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== 'password') {
        return;
      }

      const form = target.closest('form');
      window.setTimeout(() => {
        if (form) {
          void processFormCredential(form);
        } else {
          void processPageCredential();
        }
      }, 0);
    };

    bindEvent(document, 'submit', onDocumentSubmit, { capture: true });
    bindEvent(document, 'click', onDocumentClick, { capture: true });
    bindEvent(document, 'keydown', onKeydown, { capture: true });
    bindEvent(document, 'focusin', onPasswordInteraction, { capture: true });
    bindEvent(document, 'input', onPasswordInteraction, { capture: true });
    bindEvent(document, 'change', onPasswordInteraction, { capture: true });
    bindEvent(document, 'input', onUsernameInteraction, { capture: true });
    bindEvent(document, 'change', onUsernameInteraction, { capture: true });

    bindExistingForms();

    observer = new MutationObserver((records) => {
      if (observerTimer !== null) {
        window.clearTimeout(observerTimer);
      }

      observerTimer = window.setTimeout(() => {
        for (const record of records) {
          for (const node of Array.from(record.addedNodes)) {
            if (!(node instanceof Element)) {
              continue;
            }

            if (node instanceof HTMLFormElement) {
              attachFormSubmitListener(node);
            }

            const nestedForms = node.querySelectorAll('form');
            for (const form of Array.from(nestedForms)) {
              if (form instanceof HTMLFormElement) {
                attachFormSubmitListener(form);
              }
            }
          }
        }
      }, 500);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    const originalFetch = window.fetch;
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      maybeCaptureFromAjax();
      return originalFetch.call(window, input, init);
    };

    const originalXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest,
      body?: Document | XMLHttpRequestBodyInit | null,
    ): void {
      maybeCaptureFromAjax();
      originalXhrSend.call(this, body);
    };

    ctx.onInvalidated(() => {
      if (dismissActiveBar) {
        dismissActiveBar();
      }

      if (observer) {
        observer.disconnect();
        observer = null;
      }

      if (observerTimer !== null) {
        window.clearTimeout(observerTimer);
        observerTimer = null;
      }

      for (const cleanup of listenerCleanups) {
        cleanup();
      }

      window.fetch = originalFetch;
      XMLHttpRequest.prototype.send = originalXhrSend;
    });
  },
});
