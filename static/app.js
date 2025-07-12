/**
 * AI Tea Party - Glass UI Chat Application
 * Modern responsive chat interface with WebGL liquid glass effects
 */

class GlassUIManager {
    constructor() {
        this.modals = new Map();
        this.notifications = [];
        this.init();
    }

    init() {
        this.setupModals();
        this.setupNotifications();
        this.bindGlobalEvents();
    }

    setupModals() {
        const modalElements = document.querySelectorAll('.modal-overlay');
        modalElements.forEach(modal => {
            const modalId = modal.id;
            this.modals.set(modalId, {
                element: modal,
                isOpen: false
            });

            // Close button handlers
            const closeButtons = modal.querySelectorAll('[data-close]');
            closeButtons.forEach(btn => {
                btn.addEventListener('click', () => this.closeModal(modalId));
            });

            // Backdrop click to close
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modalId);
                }
            });
        });
    }

    setupNotifications() {
        this.notificationContainer = document.getElementById('notificationContainer');
        if (!this.notificationContainer) {
            this.notificationContainer = document.createElement('div');
            this.notificationContainer.id = 'notificationContainer';
            this.notificationContainer.className = 'notification-container';
            document.body.appendChild(this.notificationContainer);
        }
    }

    bindGlobalEvents() {
        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });

        // Glass button hover effects
        this.setupGlassEffects();
    }

    setupGlassEffects() {
        // Enhanced hover effects for glass elements
        const glassElements = document.querySelectorAll('.glass-btn, .character-card');
        glassElements.forEach(element => {
            element.addEventListener('mouseenter', (e) => {
                this.addGlassHoverEffect(e.target);
            });

            element.addEventListener('mouseleave', (e) => {
                this.removeGlassHoverEffect(e.target);
            });
        });
    }

    addGlassHoverEffect(element) {
        element.style.transform = 'translateY(-2px) scale(1.02)';
        element.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.2)';
    }

    removeGlassHoverEffect(element) {
        element.style.transform = '';
        element.style.boxShadow = '';
    }

    openModal(modalId) {
        const modal = this.modals.get(modalId);
        if (modal && !modal.isOpen) {
            modal.element.classList.add('active');
            modal.isOpen = true;
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId) {
        const modal = this.modals.get(modalId);
        if (modal && modal.isOpen) {
            modal.element.classList.remove('active');
            modal.isOpen = false;
            document.body.style.overflow = '';
        }
    }

    closeAllModals() {
        this.modals.forEach((modal, modalId) => {
            if (modal.isOpen) {
                this.closeModal(modalId);
            }
        });
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = this.getNotificationIcon(type);
        notification.innerHTML = `
            <i class="${icon}"></i>
            <div class="notification-content">${message}</div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            this.removeNotification(notification);
        });

        // Auto remove
        setTimeout(() => {
            this.removeNotification(notification);
        }, duration);

        this.notificationContainer.appendChild(notification);
        this.notifications.push(notification);

        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);
    }

    removeNotification(notification) {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            const index = this.notifications.indexOf(notification);
            if (index > -1) {
                this.notifications.splice(index, 1);
            }
        }, 300);
    }

    getNotificationIcon(type) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        return icons[type] || icons.info;
    }
}

class ChatApp {
    constructor() {
        this.ws = null;
        this.roomId = 'default';
        this.currentRoom = null;
        this.rooms = [];
        this.characters = [];
        this.isAutoChat = false;
        this.uiManager = new GlassUIManager();

        this.initializeElements();
        this.bindEvents();
        this.connectWebSocket();
        this.loadInitialData();
    }
    
    initializeElements() {
        // Main UI elements
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendMessage');
        this.characterSelect = document.getElementById('characterSelect');
        this.characterGrid = document.getElementById('characterGrid');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.roomTitle = document.getElementById('roomTitle');
        this.roomStatus = document.getElementById('roomStatus');
        
        // Control buttons
        this.startAutoChatBtn = document.getElementById('startAutoChat');
        this.stopAutoChatBtn = document.getElementById('stopAutoChat');
        this.clearChatBtn = document.getElementById('clearChat');
        this.addCharacterBtn = document.getElementById('addCharacterBtn');
        
        // Header controls
        this.apiConfigBtn = document.getElementById('apiConfigBtn');
        this.roomSettingsBtn = document.getElementById('roomSettingsBtn');
        
        // Form elements
        this.saveCharacterBtn = document.getElementById('saveCharacter');
        this.saveApiConfigBtn = document.getElementById('saveApiConfig');
        this.testApiConnectionBtn = document.getElementById('testApiConnection');
        this.saveRoomSettingsBtn = document.getElementById('saveRoomSettings');
        this.toggleApiKeyBtn = document.getElementById('toggleApiKey');
        
        // Form inputs
        this.apiProviderSelect = document.getElementById('apiProvider');
        this.apiKeyInput = document.getElementById('apiKey');
        this.apiModelSelect = document.getElementById('apiModel');
    }
    
    bindEvents() {
        // Message sending
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Chat controls
        this.startAutoChatBtn.addEventListener('click', () => this.startAutoChat());
        this.stopAutoChatBtn.addEventListener('click', () => this.stopAutoChat());
        this.clearChatBtn.addEventListener('click', () => this.clearChat());
        
        // Character management
        this.addCharacterBtn.addEventListener('click', () => this.showAddCharacterModal());
        this.saveCharacterBtn.addEventListener('click', () => this.saveCharacter());
        
        // API configuration
        this.apiConfigBtn.addEventListener('click', () => this.showApiConfigModal());
        this.saveApiConfigBtn.addEventListener('click', () => this.saveApiConfig());
        this.testApiConnectionBtn.addEventListener('click', () => this.testApiConnection());
        this.apiProviderSelect.addEventListener('change', () => this.onProviderChange());
        this.toggleApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility());
        
        // Room settings
        this.roomSettingsBtn.addEventListener('click', () => this.showRoomSettingsModal());
        this.saveRoomSettingsBtn.addEventListener('click', () => this.saveRoomSettings());
        
        // Stealth mode toggle
        const stealthModeCheckbox = document.getElementById('editStealthMode');
        if (stealthModeCheckbox) {
            stealthModeCheckbox.addEventListener('change', (e) => {
                this.toggleUserDescriptionVisibility(!e.target.checked);
            });
        }

        // Input enhancements
        this.enhanceInputs();
    }

    enhanceInputs() {
        // Add glass effect to form inputs
        const inputs = document.querySelectorAll('.glass-input, .glass-textarea, .glass-select');
        inputs.forEach(input => {
            input.addEventListener('focus', (e) => {
                e.target.parentElement.classList.add('focused');
            });
            
            input.addEventListener('blur', (e) => {
                e.target.parentElement.classList.remove('focused');
            });
        });
    }
    
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/${this.roomId}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket连接已建立');
            this.updateConnectionStatus('connected');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket连接已关闭');
            this.updateConnectionStatus('disconnected');
            // 尝试重连
            setTimeout(() => this.connectWebSocket(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket错误:', error);
            this.updateConnectionStatus('error');
        };
    }
    
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'message':
                this.displayMessage(data.data);
                break;
            case 'character_update':
                this.handleCharacterUpdate(data.data);
                break;
            case 'room_status':
                this.handleRoomStatus(data.data);
                break;
        }
    }
    
    updateConnectionStatus(status) {
        const statusElement = this.connectionStatus;
        statusElement.className = 'status-indicator';
        
        switch (status) {
            case 'connected':
                statusElement.classList.add('connected');
                statusElement.innerHTML = '<i class="fas fa-circle"></i> 已连接';
                break;
            case 'disconnected':
                statusElement.classList.add('disconnected');
                statusElement.innerHTML = '<i class="fas fa-circle"></i> 已断开';
                break;
            case 'error':
                statusElement.classList.add('connecting');
                statusElement.innerHTML = '<i class="fas fa-circle"></i> 连接错误';
                break;
            default:
                statusElement.classList.add('connecting');
                statusElement.innerHTML = '<i class="fas fa-circle"></i> 连接中...';
        }
    }
    
    async loadInitialData() {
        try {
            // Load room info
            const roomResponse = await fetch(`/api/rooms/${this.roomId}`);
            if (roomResponse.ok) {
                const roomData = await roomResponse.json();
                this.updateRoomInfo(roomData);
            }

            // Load characters
            await this.loadCharacters();

            // Load chat history
            await this.loadChatHistory();

            // Load API config
            await this.loadApiConfig();

        } catch (error) {
            console.error('加载初始数据失败:', error);
            this.uiManager.showNotification('加载初始数据失败', 'error');
        }
    }

    async loadCharacters() {
        try {
            const response = await fetch(`/api/rooms/${this.roomId}/characters`);
            if (response.ok) {
                this.characters = await response.json();
                this.updateCharacterGrid();
                this.updateCharacterSelect();
            }
        } catch (error) {
            console.error('加载角色列表失败:', error);
            this.uiManager.showNotification('加载角色列表失败', 'error');
        }
    }

    async loadChatHistory() {
        try {
            const response = await fetch(`/api/rooms/${this.roomId}/messages`);
            if (response.ok) {
                const messages = await response.json();
                this.chatMessages.innerHTML = '';
                messages.forEach(message => this.displayMessage(message));
            }
        } catch (error) {
            console.error('加载聊天历史失败:', error);
            this.uiManager.showNotification('加载聊天历史失败', 'error');
        }
    }

    updateRoomInfo(roomData) {
        this.roomTitle.textContent = roomData.name;
        this.isAutoChat = roomData.is_auto_chat;
        this.updateAutoChatButtons();
        this.updateRoomStatus();
    }

    updateRoomStatus() {
        const statusText = this.isAutoChat ? '自动聊天中' : '准备就绪';
        this.roomStatus.textContent = statusText;
        this.roomStatus.className = `room-badge ${this.isAutoChat ? 'active' : ''}`;
    }

    updateAutoChatButtons() {
        this.startAutoChatBtn.disabled = this.isAutoChat;
        this.stopAutoChatBtn.disabled = !this.isAutoChat;
        
        if (this.isAutoChat) {
            this.startAutoChatBtn.classList.add('disabled');
            this.stopAutoChatBtn.classList.remove('disabled');
        } else {
            this.startAutoChatBtn.classList.remove('disabled');
            this.stopAutoChatBtn.classList.add('disabled');
        }
    }

    updateCharacterGrid() {
        this.characterGrid.innerHTML = '';

        this.characters.forEach(character => {
            const characterCard = document.createElement('div');
            characterCard.className = 'character-card';
            characterCard.innerHTML = `
                <div class="character-name">${character.name}</div>
                <div class="character-personality">${character.personality}</div>
                <div class="character-actions">
                    <button class="glass-btn" onclick="app.generateResponse('${character.id}')" title="让${character.name}发言">
                        <i class="fas fa-comment"></i>
                    </button>
                    <button class="glass-btn" onclick="app.removeCharacter('${character.id}')" title="删除角色">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            this.characterGrid.appendChild(characterCard);
        });

        // Reapply glass effects to new elements
        this.uiManager.setupGlassEffects();
    }

    updateCharacterSelect() {
        this.characterSelect.innerHTML = '<option value="">选择角色发言</option>';

        this.characters.forEach(character => {
            const option = document.createElement('option');
            option.value = character.id;
            option.textContent = character.name;
            this.characterSelect.appendChild(option);
        });
    }

    displayMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.is_system ? 'system' : 'character'}`;

        if (message.is_system) {
            messageElement.innerHTML = `
                <div class="message-content">${message.content}</div>
                <div class="message-time">${this.formatTime(message.timestamp)}</div>
            `;
        } else {
            messageElement.innerHTML = `
                <div class="message-header">
                    <span class="message-author">${message.character_name}</span>
                    <span class="message-time">${this.formatTime(message.timestamp)}</span>
                </div>
                <div class="message-content">${message.content}</div>
            `;
        }

        this.chatMessages.appendChild(messageElement);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    async sendMessage() {
        const characterId = this.characterSelect.value;
        const content = this.messageInput.value.trim();

        if (!characterId || !content) {
            this.uiManager.showNotification('请选择角色并输入消息内容', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/rooms/${this.roomId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    character_id: characterId,
                    content: content
                })
            });

            if (response.ok) {
                this.messageInput.value = '';
                this.uiManager.showNotification('消息发送成功', 'success', 2000);
            } else {
                this.uiManager.showNotification('发送消息失败', 'error');
            }
        } catch (error) {
            console.error('发送消息失败:', error);
            this.uiManager.showNotification('发送消息失败', 'error');
        }
    }

    async generateResponse(characterId) {
        const character = this.characters.find(c => c.id === characterId);
        if (!character) return;

        try {
            this.uiManager.showNotification(`正在生成${character.name}的回复...`, 'info', 2000);
            
            const response = await fetch(`/api/rooms/${this.roomId}/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    character_id: characterId
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                this.uiManager.showNotification(errorData.detail || '生成AI回复失败', 'error');
            }
        } catch (error) {
            console.error('生成AI回复失败:', error);
            this.uiManager.showNotification('生成AI回复失败', 'error');
        }
    }

    async startAutoChat() {
        try {
            const response = await fetch(`/api/rooms/${this.roomId}/auto-chat/start`, {
                method: 'POST'
            });

            if (response.ok) {
                this.isAutoChat = true;
                this.updateAutoChatButtons();
                this.updateRoomStatus();
                this.uiManager.showNotification('自动聊天已启动', 'success');
            } else {
                const errorData = await response.json();
                this.uiManager.showNotification(errorData.detail || '启动自动聊天失败', 'error');
            }
        } catch (error) {
            console.error('启动自动聊天失败:', error);
            this.uiManager.showNotification('启动自动聊天失败', 'error');
        }
    }

    async stopAutoChat() {
        try {
            const response = await fetch(`/api/rooms/${this.roomId}/auto-chat/stop`, {
                method: 'POST'
            });

            if (response.ok) {
                this.isAutoChat = false;
                this.updateAutoChatButtons();
                this.updateRoomStatus();
                this.uiManager.showNotification('自动聊天已停止', 'success');
            } else {
                this.uiManager.showNotification('停止自动聊天失败', 'error');
            }
        } catch (error) {
            console.error('停止自动聊天失败:', error);
            this.uiManager.showNotification('停止自动聊天失败', 'error');
        }
    }

    async clearChat() {
        if (!confirm('确定要清空聊天记录吗？')) {
            return;
        }

        try {
            const response = await fetch(`/api/rooms/${this.roomId}/messages`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.chatMessages.innerHTML = '';
                this.uiManager.showNotification('聊天记录已清空', 'success');
            } else {
                this.uiManager.showNotification('清空聊天记录失败', 'error');
            }
        } catch (error) {
            console.error('清空聊天记录失败:', error);
            this.uiManager.showNotification('清空聊天记录失败', 'error');
        }
    }

    showAddCharacterModal() {
        // Clear form
        document.getElementById('characterName').value = '';
        document.getElementById('characterPersonality').value = '';
        document.getElementById('characterBackground').value = '';
        document.getElementById('characterStyle').value = '';

        this.uiManager.openModal('addCharacterModal');
    }

    async saveCharacter() {
        const name = document.getElementById('characterName').value.trim();
        const personality = document.getElementById('characterPersonality').value.trim();
        const background = document.getElementById('characterBackground').value.trim();
        const speakingStyle = document.getElementById('characterStyle').value.trim();

        if (!name || !personality || !background) {
            this.uiManager.showNotification('请填写必要的角色信息', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/rooms/${this.roomId}/characters`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: name,
                    personality: personality,
                    background: background,
                    speaking_style: speakingStyle
                })
            });

            if (response.ok) {
                this.uiManager.closeModal('addCharacterModal');
                await this.loadCharacters();
                this.uiManager.showNotification(`角色 ${name} 添加成功`, 'success');
            } else {
                const errorData = await response.json();
                this.uiManager.showNotification(errorData.detail || '添加角色失败', 'error');
            }
        } catch (error) {
            console.error('添加角色失败:', error);
            this.uiManager.showNotification('添加角色失败', 'error');
        }
    }

    async removeCharacter(characterId) {
        const character = this.characters.find(c => c.id === characterId);
        if (!character) return;

        if (!confirm(`确定要删除角色 ${character.name} 吗？`)) {
            return;
        }

        try {
            const response = await fetch(`/api/rooms/${this.roomId}/characters/${characterId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                await this.loadCharacters();
                this.uiManager.showNotification(`角色 ${character.name} 已删除`, 'success');
            } else {
                this.uiManager.showNotification('删除角色失败', 'error');
            }
        } catch (error) {
            console.error('删除角色失败:', error);
            this.uiManager.showNotification('删除角色失败', 'error');
        }
    }

    handleCharacterUpdate(data) {
        this.loadCharacters();
    }

    handleRoomStatus(data) {
        if (data.is_auto_chat !== undefined) {
            this.isAutoChat = data.is_auto_chat;
            this.updateAutoChatButtons();
            this.updateRoomStatus();
        }
    }

    // API Configuration
    async loadApiConfig() {
        try {
            const response = await fetch('/api/config');
            if (response.ok) {
                const data = await response.json();
                this.updateCurrentProviderDisplay(data.current_config);
                this.availableProviders = data.available_providers;
            }
        } catch (error) {
            console.error('加载API配置失败:', error);
        }
    }

    updateCurrentProviderDisplay(config) {
        // Update connection status based on config
        if (config && config.provider) {
            const providerNames = {
                'deepseek_chat': 'DeepSeek Chat',
                'deepseek_reasoner': 'DeepSeek Reasoner',
                'gemini_25_flash': 'Gemini 2.5 Flash',
                'gemini_25_pro': 'Gemini 2.5 Pro'
            };
            
            const providerName = providerNames[config.provider] || config.provider;
            // You can update UI to show current provider if needed
        }
    }

    showApiConfigModal() {
        this.uiManager.openModal('apiConfigModal');
    }

    onProviderChange() {
        const provider = this.apiProviderSelect.value;
        this.updateApiKeyHelp(provider);
    }

    updateApiKeyHelp(provider) {
        const helpText = document.getElementById('apiKeyHelp');
        if (!helpText) return;

        const helpMessages = {
            'deepseek_chat': '请输入您的 DeepSeek API 密钥',
            'deepseek_reasoner': '请输入您的 DeepSeek API 密钥',
            'gemini_25_flash': '请输入您的 Google Gemini API 密钥',
            'gemini_25_pro': '请输入您的 Google Gemini API 密钥'
        };

        helpText.textContent = helpMessages[provider] || '请输入您的API密钥';
    }

    toggleApiKeyVisibility() {
        const input = this.apiKeyInput;
        const button = this.toggleApiKeyBtn;
        
        if (input.type === 'password') {
            input.type = 'text';
            button.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            input.type = 'password';
            button.innerHTML = '<i class="fas fa-eye"></i>';
        }
    }

    async saveApiConfig() {
        const provider = this.apiProviderSelect.value;
        const apiKey = this.apiKeyInput.value.trim();
        const model = this.apiModelSelect.value;

        if (!provider || !apiKey) {
            this.uiManager.showNotification('请选择API提供商并输入密钥', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    provider: provider,
                    api_key: apiKey,
                    model: model || null
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.uiManager.closeModal('apiConfigModal');
                this.uiManager.showNotification('API配置保存成功', 'success');
                
                if (data.test_result && !data.test_result.success) {
                    this.uiManager.showNotification('API连接测试失败: ' + data.test_result.error, 'warning');
                }
            } else {
                const errorData = await response.json();
                this.uiManager.showNotification(errorData.detail || '保存API配置失败', 'error');
            }
        } catch (error) {
            console.error('保存API配置失败:', error);
            this.uiManager.showNotification('保存API配置失败', 'error');
        }
    }

    async testApiConnection() {
        try {
            this.uiManager.showNotification('正在测试API连接...', 'info', 2000);
            
            const response = await fetch('/api/test-connection', {
                method: 'POST'
            });

            const data = await response.json();
            
            if (data.success) {
                this.uiManager.showNotification(
                    `API连接成功！响应时间: ${data.response_time}秒`, 
                    'success'
                );
            } else {
                this.uiManager.showNotification(
                    `API连接失败: ${data.error}`, 
                    'error'
                );
            }
        } catch (error) {
            console.error('测试API连接失败:', error);
            this.uiManager.showNotification('测试API连接失败', 'error');
        }
    }

    // Room Settings
    showRoomSettingsModal() {
        // Load current room settings
        const roomNameInput = document.getElementById('editRoomName');
        const roomDescInput = document.getElementById('editRoomDescription');
        const stealthModeInput = document.getElementById('editStealthMode');
        const userDescInput = document.getElementById('editUserDescription');

        if (roomNameInput) roomNameInput.value = this.roomTitle.textContent;
        if (roomDescInput) roomDescInput.value = '';
        if (stealthModeInput) stealthModeInput.checked = false;
        if (userDescInput) userDescInput.value = '';

        this.uiManager.openModal('roomSettingsModal');
    }

    async saveRoomSettings() {
        const roomName = document.getElementById('editRoomName').value.trim();
        const roomDesc = document.getElementById('editRoomDescription').value.trim();
        const stealthMode = document.getElementById('editStealthMode').checked;
        const userDesc = document.getElementById('editUserDescription').value.trim();

        try {
            const response = await fetch(`/api/rooms/${this.roomId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: roomName,
                    description: roomDesc,
                    stealth_mode: stealthMode,
                    user_description: userDesc
                })
            });

            if (response.ok) {
                this.uiManager.closeModal('roomSettingsModal');
                this.uiManager.showNotification('聊天室设置已保存', 'success');
                
                // Update room title
                if (roomName) {
                    this.roomTitle.textContent = roomName;
                }
            } else {
                const errorData = await response.json();
                this.uiManager.showNotification(errorData.detail || '保存聊天室设置失败', 'error');
            }
        } catch (error) {
            console.error('保存聊天室设置失败:', error);
            this.uiManager.showNotification('保存聊天室设置失败', 'error');
        }
    }

    toggleUserDescriptionVisibility(show) {
        const userDescGroup = document.getElementById('editUserDescriptionGroup');
        if (userDescGroup) {
            userDescGroup.style.display = show ? 'block' : 'none';
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ChatApp();
});

// Handle page visibility changes for performance
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Pause any intensive operations when page is hidden
        console.log('Page hidden, pausing operations');
    } else {
        // Resume operations when page is visible
        console.log('Page visible, resuming operations');
    }
});

// Export for global access
window.ChatApp = ChatApp;
window.GlassUIManager = GlassUIManager;
