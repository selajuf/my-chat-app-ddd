(function() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') document.body.classList.add('dark-theme');
})();

document.addEventListener('DOMContentLoaded', () => {

    const elements = {
        sendBtn: document.getElementById('sendBtn'),
        toggleBtn: document.getElementById('toggleSidebarBtn'),
        openBtn: document.getElementById("openSidebarBtn"),
        sidebar: document.querySelector('.sidebar'),
        chatInput: document.getElementById('chatInput'),
        chatArea: document.getElementById('chatArea'),
        sidebarToggleOpen: document.querySelector('.sidebar-toggle-open'),
        headerTitle: document.querySelector('.header-content h1'),
        chatHistoryContainer: document.getElementById('chatHistoryContainer'),
        noHistoryMessage: document.getElementById('noHistoryMessage'),
        newChatBtn: document.getElementById('newChatBtn'),
        themeToggleBtn: document.getElementById('themeToggleBtn')
    };

    for (const [name, el] of Object.entries(elements)) {
        if (!el) {
            console.error(`Элемент ${name} не найден в DOM.`);
            return;
        }
    }

    const sidebarMobileOverlay = document.querySelector('.sidebar-mobile-overlay')
        || (() => {
            const overlay = document.createElement('div');
            overlay.className = 'sidebar-mobile-overlay hidden';
            document.body.appendChild(overlay);
            return overlay;
        })();

    function openMobileSidebar() {
        elements.sidebar.classList.add('sidebar-mobile-open');
        sidebarMobileOverlay.classList.remove('hidden');
        document.body.classList.add('sidebar-mobile-open');
    }
    function closeMobileSidebar() {
        elements.sidebar.classList.remove('sidebar-mobile-open');
        sidebarMobileOverlay.classList.add('hidden');
        document.body.classList.remove('sidebar-mobile-open');
    }

    elements.sidebarToggleOpen.addEventListener('click', openMobileSidebar);
    sidebarMobileOverlay.addEventListener('click', closeMobileSidebar);
    window.addEventListener('keydown', (e) => {
        if (e.key === "Escape" && document.body.classList.contains('sidebar-mobile-open')) {
            closeMobileSidebar();
        }
    });

    elements.toggleBtn.addEventListener('click', function () {
        if (window.innerWidth <= 800) {
            closeMobileSidebar();
        } else {
            document.body.classList.add("sidebar-hidden");
            elements.headerTitle.style.transitionDelay = '0.12s';
        }
    });

    function swapIcons(isDark) {
        const icons = [
            { selector: '#themeToggleBtn .theme-toggle', dark: '/src/img/theme-toggle_sun.png', light: '/src/img/switch_theme_white.png' },
            { selector: '.logo', dark: '/src/img/openai_logo_white.png', light: '/src/img/openai_logo_dark.png' },
            { selector: '.toggle-sidebar', dark: '/src/img/sidebar_black.png', light: '/src/img/sidebar.png' },
            { selector: '.newChatBtn', dark: '/src/img/new_chat_black.png', light: '/src/img/new_chat_white.png' },
            { selector: '.sidebar-toggle-open_icon', dark: '/src/img/sidebar_open_black.png', light: '/src/img/sidebar_open.png' }
        ];
        icons.forEach(({selector, dark, light}) => {
            const el = document.querySelector(selector);
            if (el) el.src = isDark ? dark : light;
        });
    }

    function toggleTheme() {
        const isDark = document.body.classList.toggle("dark-theme");
        swapIcons(isDark);
        localStorage.setItem("theme", isDark ? "dark" : "light");
    }

    function autoResizeChatInput() {
        const el = elements.chatInput;
        const minHeight = 56;
        const maxHeight = 180;
        el.style.height = minHeight + 'px';
        if (!el.value) return;
        el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
    }

    function scrollToBottom() {
        elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
    }

    document.body.classList.add('fade-in');
    elements.chatInput.addEventListener('input', autoResizeChatInput);
    elements.themeToggleBtn.addEventListener('click', toggleTheme);

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        swapIcons(true);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const chatIdFromURL = urlParams.get('id');

    let autoScroll = true;
    let currentChatId = null;
    let chatDataCache = {};
    let currentSessionId = null;

    elements.chatArea.addEventListener('scroll', () => {
        autoScroll = isScrolledToBottom(elements.chatArea);
    });

    elements.newChatBtn.addEventListener('click', () => {
        elements.chatArea.innerHTML = '';
        elements.chatInput.value = '';
        elements.chatInput.style.height = '';
        currentChatId = null;
        window.history.pushState({}, '', `/chat`);
    });

    elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    elements.sendBtn.addEventListener('click', sendMessage);

    elements.toggleBtn.addEventListener("click", () => {
        document.body.classList.add("sidebar-hidden");
        elements.headerTitle.style.transitionDelay = '0.12s';
    });

    elements.openBtn.addEventListener("click", () => {
        elements.headerTitle.style.transitionDelay = '0s';
        document.body.classList.remove("sidebar-hidden");
    });

    async function loadChatHistory() {
        try {
            const response = await fetch('/api/chats');
            const data = await response.json();

            if (!Array.isArray(data.chats)) return;

            elements.noHistoryMessage?.remove();

            const now = new Date();
            const groups = groupChatsByDate(data.chats, now);

            renderChatHistory(groups);
        } catch (err) {
            console.error('Ошибка загрузки истории чатов:', err);
        }
    }

    function groupChatsByDate(chats, now) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
        const dayBeforeYesterday = new Date(today); dayBeforeYesterday.setDate(today.getDate() - 2);

        const groups = {
            today: [], yesterday: [], dayBeforeYesterday: [],
            week: [], month: [], threeMonths: [],
            sixMonths: [], year: [], old: []
        };

        chats.forEach(chat => {
            const createdAt = new Date(chat.created_at);
            const chatDate = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());

            if (chatDate.getTime() === today.getTime()) {
                groups.today.push(chat);
            } else if (chatDate.getTime() === yesterday.getTime()) {
                groups.yesterday.push(chat);
            } else if (chatDate.getTime() === dayBeforeYesterday.getTime()) {
                groups.dayBeforeYesterday.push(chat);
            } else {

                const diffDays = Math.floor((today - chatDate) / 8.64e7);
                if (diffDays <= 7) groups.week.push(chat);
                else if (diffDays <= 30) groups.month.push(chat);
                else if (diffDays <= 90) groups.threeMonths.push(chat);
                else if (diffDays <= 180) groups.sixMonths.push(chat);
                else if (diffDays <= 365) groups.year.push(chat);
                else groups.old.push(chat);
            }
        });

        for (const group in groups) {
            groups[group].sort((a, b) => {
                const aTime = new Date(a.updated_at || a.created_at).getTime();
                const bTime = new Date(b.updated_at || b.created_at).getTime();
                return bTime - aTime;
            });
        }

        return groups;
    }


    function renderChatHistory(groups) {
        const groupLabels = {
            today: 'Сегодня', yesterday: 'Вчера', dayBeforeYesterday: 'Позавчера',
            week: 'Более 3 дней назад', month: 'Более недели назад',
            threeMonths: 'Более месяца назад', sixMonths: 'Более 3 месяцев назад',
            year: 'Более 6 месяцев назад', old: 'Более года назад'
        };

        elements.chatHistoryContainer.innerHTML = '';
        Object.entries(groups).forEach(([key, chats]) => {
            if (!chats.length) return;
            const groupContainer = document.createElement('div');
            groupContainer.className = 'history-group';
            groupContainer.dataset.groupKey = key;

            groupContainer.innerHTML = `<div class="history-group-label">${groupLabels[key]}</div>`;
            chats.forEach(chat => {
                const btn = document.createElement('button');
                btn.className = 'history-chat-btn';
                btn.textContent = chat.title || 'Без названия';
                btn.dataset.chatId = chat.id;
                btn.addEventListener('click', () => loadChatById(chat.id));
                groupContainer.appendChild(btn);
            });
            elements.chatHistoryContainer.appendChild(groupContainer);
        });
    }

    function appendMessage(sender, text) {
        const messageElement = formatMessage(text, sender);
        elements.chatArea.appendChild(messageElement);
        scrollToBottom();
        chatDataCache[currentChatId] = chatDataCache[currentChatId] || [];
        chatDataCache[currentChatId].push({ sender, text });
    }

    async function loadChatById(chatId) {
        try {
            const response = await fetch(`/api/chat/${chatId}`);
            if (!response.ok) throw new Error('Чат не найден');
            const data = await response.json();
            document.querySelectorAll('.history-chat-btn').forEach(btn =>
                btn.classList.toggle('active', btn.dataset.chatId === chatId));
            currentChatId = chatId;
            currentSessionId = data.session_id || null;
            elements.chatArea.innerHTML = '';
            data.messages.forEach(msg => appendMessage(msg.sender === 'user' ? 'user' : 'bot', msg.text));
            window.history.pushState({}, '', `/chat?id=${chatId}`);
        } catch (err) {
            console.error('Ошибка загрузки чата:', err);
        }
    }

    function isBlankMarkdown(md) {
        return marked.parse(md).trim() === '<p></p>';
    }

    function formatMessage(message, className) {
        const container = document.createElement('div');
        container.classList.add('message', className);
        const bubble = document.createElement('div');
        bubble.classList.add('bubble', 'fade-in');
        if (className === 'bot') {
            bubble.innerHTML = isBlankMarkdown(message) ? '' : marked.parse(message);
            addCopyButtonsToCodeBlocks(bubble);
        } else {
            bubble.textContent = message;
        }
        container.appendChild(bubble);
        return container;
    }

    function addCopyButtonsToCodeBlocks(container = document) {
        container.querySelectorAll('pre > code').forEach(codeBlock => {
            if (codeBlock.parentElement.querySelector('.copy-code-btn')) return;
            codeBlock.parentElement.style.position = 'relative';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'copy-code-btn';
            btn.title = 'Скопировать';
            btn.innerHTML = `
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                    <rect x="9" y="7" width="10" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
                    <rect x="3" y="3" width="10" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
                </svg>`;
            btn.onclick = () => {
                navigator.clipboard.writeText(codeBlock.textContent).then(() => {
                    btn.classList.add('copied');
                    btn.title = 'Скопировано!';
                    btn.blur();
                    setTimeout(() => {
                        btn.classList.add('fade-copied');
                        setTimeout(() => {
                            btn.classList.remove('copied', 'fade-copied');
                            btn.title = 'Скопировать';
                        }, 300);
                    }, 500);
                });
            };
            codeBlock.parentElement.appendChild(btn);
        });
    }

    async function sendMessage() {
        const message = elements.chatInput.value.trim();
        if (!message) return;
        if (!currentChatId) {
            try {
                const title = extractChatTitle(message);
                const res = await fetch('/api/chats/new', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title })
                });
                const data = await res.json();
                currentChatId = data.id;
                currentSessionId = data.session_id || null;
                window.history.pushState({}, '', `/chat?id=${currentChatId}`);
                loadChatHistory();
            } catch (e) {
                console.error("Ошибка при создании нового чата:", e);
                return;
            }
        }
        appendMessage('user', message);
        elements.chatInput.value = '';
        elements.chatInput.style.height = '';
        const messageElement = formatMessage('', 'bot');
        elements.chatArea.appendChild(messageElement);
        scrollToBottom();

        try {
            const response = await fetch('/api/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, chat_id: currentChatId })
            });
            if (!response.ok || !response.body) {
                appendMessage('bot', '❌ Ошибка от сервера');
                return;
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullText = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                fullText += chunk;
                const bubble = messageElement.querySelector('.bubble');
                bubble.innerHTML = marked.parse(fullText);
                addCopyButtonsToCodeBlocks(bubble);
                if (autoScroll) scrollToBottom();
                await loadChatHistory();
            }
        } catch (error) {
            console.error("Ошибка при отправке сообщения:", error);
            appendMessage('bot', '❌ Ошибка при отправке запроса');
        }
    }

    function isScrolledToBottom(chatArea, threshold = 50) {
        return chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < threshold;
    }

    function extractChatTitle(text) {
        const clean = text.replace(/[*#>\[\]_`~\-]/g, '').trim();
        const words = clean.split(/\s+/).slice(0, 3);
        const title = words.join(' ');
        return title.length > 50 ? title.slice(0, 47) + '...' : title || 'Без названия';
    }

    (async () => {
        if (chatIdFromURL) {
            await Promise.all([
                loadChatHistory(),
                loadChatById(chatIdFromURL)
            ]);
        } else {
            await loadChatHistory();
        }
        // Плавно скрываем loader
        setTimeout(() => {
            document.getElementById('mainLoader').classList.add('loader-hidden');
        }, 200);
        setTimeout(() => {
            const l = document.getElementById('mainLoader');
            if (l) l.remove();
        }, 700);
    })();
});
