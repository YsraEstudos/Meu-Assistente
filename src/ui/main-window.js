// Simple logger for renderer process
const logger = {
    info: (...args) => console.log('[MainWindowUI]', ...args),
    debug: (...args) => {
        if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isDevelopment === false) {
            return;
        }
        console.log('[MainWindowUI DEBUG]', ...args);
    },
    error: (...args) => console.error('[MainWindowUI ERROR]', ...args),
    warn: (...args) => console.warn('[MainWindowUI WARN]', ...args)
};
const MAX_CAPTURE_RESTART_ATTEMPTS = 3;

class MainWindowUI {
    constructor() {
        this.isInteractive = false;
        this.isHidden = false;
        this.currentSkill = 'dsa'; // Default, will be updated from settings
        this.statusDot = null;
        this.skillIndicator = null;
        this.micButton = null;
        this.isRecording = false;
        this.speechAvailable = false; // track availability
        this.whisperStatus = null;
        this._whisperStatusRequest = null;
        this._micTogglePending = false;
        this._isTranscribing = false;
        this._popoverHideTimeout = null;
        // Renderer-side audio capture state (used for Whisper on Windows)
        this._audioContext = null;
        this._mediaStream = null;
        this._scriptNode = null;
        this._captureWatchdog = null;
        this._captureStatsTimer = null;
        this._captureStartPromise = null;
        this._captureRestartPromise = null;
        this._captureGeneration = 0;
        this._captureRestartCount = 0;
        this._captureStats = null;
        
        // Define available skills for navigation
        this.availableSkills = [
            'dsa'
        ];
        
        this.init();
    }

    async init() {
        try {
            this.setupElements();
            this.setupEventListeners();
            
            // Load current skill from settings
            await this.loadCurrentSkill();
            
            // Load current interaction state
            await this.loadCurrentInteractionState();
            
            // Fetch speech availability
            await this.loadSpeechAvailability();
            
            this.updateSkillIndicator();
            this.updateAllElementStates(); // Update all elements with current state
            this.resizeWindowToContent();
            this.loadWhisperStatus(false);
            
            logger.info('Main window UI initialized', {
                component: 'MainWindowUI',
                skill: this.currentSkill,
                interactive: this.isInteractive
            });

            // Notify the main process that the overlay renderer is ready
            // so it can push the latest speech availability state.
            if (window.electronAPI && window.electronAPI.notifyMainWindowReady) {
                window.electronAPI.notifyMainWindowReady();
            }
            
        } catch (error) {
            logger.error('Failed to initialize main window UI', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    async loadCurrentSkill() {
        try {
            if (window.electronAPI && window.electronAPI.getSettings) {
                const settings = await window.electronAPI.getSettings();
                if (settings && settings.activeSkill) {
                    this.currentSkill = settings.activeSkill;
                    logger.debug('Loaded current skill from settings', {
                        component: 'MainWindowUI',
                        skill: this.currentSkill
                    });
                }
            }
        } catch (error) {
            logger.warn('Failed to load current skill from settings', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    async loadCurrentInteractionState() {
        try {
            // Request current interaction state from main process
            if (window.electronAPI && window.electronAPI.getWindowStats) {
                const stats = await window.electronAPI.getWindowStats();
                if (stats && typeof stats.isInteractive === 'boolean') {
                    this.isInteractive = stats.isInteractive;
                    logger.debug('Loaded current interaction state', {
                        component: 'MainWindowUI',
                        interactive: this.isInteractive
                    });
                }
            }
        } catch (error) {
            // If we can't get the state, assume non-interactive (safer default)
            this.isInteractive = false;
            logger.warn('Failed to load current interaction state, defaulting to non-interactive', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    async loadSpeechAvailability() {
        try {
            if (window.electronAPI && window.electronAPI.getSpeechAvailability) {
                this.speechAvailable = await window.electronAPI.getSpeechAvailability();
                this.applyMicVisibility();
            }
        } catch (e) {
            this.speechAvailable = false;
            this.applyMicVisibility();
        }
    }

    applyMicVisibility() {
        if (this.micButton) {
            if (this.speechAvailable) {
                this.micButton.style.display = '';
            } else {
                this.micButton.style.display = 'none';
            }
            // Resize to reflect layout change
            setTimeout(() => this.resizeWindowToContent(), 50);
        }
    }

    updateAllElementStates() {
        // Update all interactive elements with current state
        this.updateStatusDot();
        this.updateSkillIndicatorState();
        this.updateMicButtonState();
        this.updateSettingsIndicatorState();
        this.updateWhisperStatusIndicator();
    }

    updateWhisperStatusIndicator() {
        if (!this.whisperStatusButton) return;
        this.whisperStatusButton.classList.remove('gpu', 'cpu', 'remote', 'error');
        const execution = this.whisperStatus && this.whisperStatus.execution;
        const kind = execution && execution.kind;
        if (kind === 'gpu') this.whisperStatusButton.classList.add('gpu');
        else if (kind === 'cpu') this.whisperStatusButton.classList.add('cpu');
        else if (kind === 'remote') this.whisperStatusButton.classList.add('remote');
        else if (kind === 'unavailable' || this.whisperStatus?.ok === false) this.whisperStatusButton.classList.add('error');
        const label = execution?.label || 'Status do Whisper indisponível';
        this.whisperStatusButton.title = label;
    }

    async loadWhisperStatus(probe = false) {
        if (!window.electronAPI) return null;
        const method = probe ? window.electronAPI.diagnoseSpeech : window.electronAPI.getSpeechStatus;
        if (typeof method !== 'function') return null;
        if (this._whisperStatusRequest && !probe) return this._whisperStatusRequest;

        const request = Promise.resolve().then(() => method(probe ? { probe: true } : undefined)).then((status) => {
            this.whisperStatus = status || null;
            this.renderWhisperStatus(status || {});
            this.updateWhisperStatusIndicator();
            return status;
        }).catch((error) => {
            const status = {
                ok: false,
                error: error.message || String(error),
                execution: { kind: 'unavailable', backend: 'none', label: 'Diagnóstico indisponível' }
            };
            this.whisperStatus = status;
            this.renderWhisperStatus(status);
            this.updateWhisperStatusIndicator();
            return status;
        }).finally(() => {
            if (!probe) this._whisperStatusRequest = null;
        });

        if (!probe) this._whisperStatusRequest = request;
        return request;
    }

    renderWhisperStatus(status = {}) {
        if (!this.whisperStatusSummary || !this.whisperStatusRows || !this.whisperStatusChecks) return;
        const execution = status.execution || {};
        const kind = execution.kind || 'unavailable';
        const fallbackText = status.fallback
            ? ' • fallback ativo: ' + (status.effectiveEngine || 'engine alternativo')
            : '';
        const summary = (execution.label || 'Backend indisponível') + fallbackText;
        this.whisperStatusSummary.textContent = summary;
        this.whisperStatusSummary.className = 'hardware-summary ' + (kind === 'gpu' ? 'gpu' : (kind === 'cpu' ? 'cpu' : (kind === 'unavailable' ? 'error' : '')));

        this.whisperStatusRows.replaceChildren();
        const engine = status.effectiveEngine || status.configuredEngine || '—';
        const gpu = status.gpu || {};
        const cpu = status.cpu || {};
        const runtimeGpu = execution.backend === 'vulkan'
            ? (execution.gpuName || gpu.name || 'GPU Vulkan')
            : 'Não utilizada (CPU)';
        const model = status.engine?.model ? String(status.engine.model).split(/[\\/]/).pop() : '—';
        const rows = [
            ['Engine configurado', status.configuredEngine || '—'],
            ['Engine em uso', engine],
            ['Backend em uso', execution.backend || '—'],
            ['GPU em uso', runtimeGpu],
            ['GPU detectada', gpu.detected ? (gpu.name || 'GPU') : 'Não detectada'],
            ['Vulkan', gpu.vulkan ? 'Disponível' : 'Não disponível'],
            ['CPU', cpu.name || cpu.vendor || '—'],
            ['Modelo', status.engine?.modelExists ? model : 'Ausente'],
            ['Worker', status.engine?.workerReady ? 'Pronto' : 'Aguardando']
        ];
        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'hardware-row';
            const labelNode = document.createElement('span');
            labelNode.className = 'hardware-row-label';
            labelNode.textContent = label;
            const valueNode = document.createElement('span');
            valueNode.className = 'hardware-row-value';
            valueNode.textContent = value;
            row.append(labelNode, valueNode);
            this.whisperStatusRows.appendChild(row);
        });

        this.whisperStatusChecks.replaceChildren();
        const checks = Array.isArray(status.checks) ? [...status.checks] : [];
        if (status.error) checks.push({ ok: false, label: status.error });
        checks.forEach((check) => {
            const item = document.createElement('li');
            item.className = check.ok ? 'ok' : 'fail';
            item.textContent = (check.ok ? '✓ ' : '✗ ') + (check.label || 'Verificação');
            this.whisperStatusChecks.appendChild(item);
        });
        if (!checks.length) {
            const item = document.createElement('li');
            item.className = 'fail';
            item.textContent = '✗ Nenhuma verificação disponível';
            this.whisperStatusChecks.appendChild(item);
        }
    }

    updateStatusDot() {
        if (this.statusDot) {
            logger.debug('Updating status dot', {
                component: 'MainWindowUI',
                isInteractive: this.isInteractive,
                currentClasses: this.statusDot.className
            });
            
            // Remove both classes first
            this.statusDot.classList.remove('interactive', 'non-interactive');
            
            // Add the appropriate class
            if (this.isInteractive) {
                this.statusDot.classList.add('interactive');
            } else {
                this.statusDot.classList.add('non-interactive');
            }
            
            logger.debug('Status dot updated', {
                component: 'MainWindowUI',
                interactive: this.isInteractive,
                newClasses: this.statusDot.className
            });
        } else {
            logger.error('Status dot element not found');
        }
    }

    updateSkillIndicatorState() {
        if (this.skillIndicator) {
            // Remove both classes first
            this.skillIndicator.classList.remove('interactive', 'non-interactive');
            
            // Add the appropriate class
            if (this.isInteractive) {
                this.skillIndicator.classList.add('interactive');
            } else {
                this.skillIndicator.classList.add('non-interactive');
            }
            
            logger.debug('Skill indicator state updated', {
                component: 'MainWindowUI',
                interactive: this.isInteractive,
                classes: this.skillIndicator.className
            });
        }
    }

    updateMicButtonState() {
        if (this.micButton) {
            // Also hide when unavailable
            this.applyMicVisibility();
            // Remove both classes first
            this.micButton.classList.remove('interactive', 'non-interactive');
            
            // Add the appropriate class
            if (this.isInteractive) {
                this.micButton.classList.add('interactive');
            } else {
                this.micButton.classList.add('non-interactive');
            }
            
            // Update button state
            this.micButton.disabled = !this.isInteractive || !this.speechAvailable ||
                this._micTogglePending || this._isTranscribing;
            
            logger.debug('Mic button state updated', {
                component: 'MainWindowUI',
                interactive: this.isInteractive,
                disabled: this.micButton.disabled
            });
        }
    }

    updateSettingsIndicatorState() {
        if (this.settingsIndicator) {
            // Remove both classes first
            this.settingsIndicator.classList.remove('interactive', 'non-interactive');
            
            // Add the appropriate class
            if (this.isInteractive) {
                this.settingsIndicator.classList.add('interactive');
            } else {
                this.settingsIndicator.classList.add('non-interactive');
            }
            
            logger.debug('Settings indicator state updated', {
                component: 'MainWindowUI',
                interactive: this.isInteractive
            });
        } else {
            logger.debug('Settings indicator not found, skipping state update');
        }
    }

    resizeWindowToContent() {
        // Wait for DOM to fully render
        setTimeout(() => {
            const commandTab = document.querySelector('.command-tab');
            if (commandTab && window.electronAPI && window.electronAPI.resizeWindow) {
                const rect = commandTab.getBoundingClientRect();
                const width = Math.ceil(rect.width);
                let height = Math.ceil(rect.height);

                // If shortcuts popover is visible, extend height to fit it
                if (this.shortcutsPopover && this.shortcutsPopover.classList.contains('is-open')) {
                    const popRect = this.shortcutsPopover.getBoundingClientRect();
                    // popover is positioned below the bar (top:36px), add that plus its height and a small margin
                    height = Math.max(height, Math.ceil(36 + popRect.height + 8));
                }
                if (this.whisperStatusPopover && this.whisperStatusPopover.classList.contains('is-open')) {
                    const popRect = this.whisperStatusPopover.getBoundingClientRect();
                    height = Math.max(height, Math.ceil(36 + popRect.height + 8));
                }
                
                logger.debug('Resizing window to content', {
                    width,
                    height,
                    component: 'MainWindowUI'
                });
                
                window.electronAPI.resizeWindow(width, height);
            }
        }, 100);
    }

    setupElements() {
        this.statusDot = document.getElementById('statusDot');
        this.skillIndicator = document.getElementById('skillIndicator');
        this.settingsIndicator = document.getElementById('settingsIndicator'); // Optional
        this.micButton = document.getElementById('micButton');
        this.whisperStatusButton = document.getElementById('whisperStatusButton');
        this.whisperStatusPopover = document.getElementById('whisperStatusPopover');
        this.whisperStatusSummary = document.getElementById('whisperStatusSummary');
        this.whisperStatusRows = document.getElementById('whisperStatusRows');
        this.whisperStatusChecks = document.getElementById('whisperStatusChecks');
        this.whisperStatusTestButton = document.getElementById('whisperStatusTestButton');
        this.infoButton = document.getElementById('infoButton');
        this.shortcutsPopover = document.getElementById('shortcutsPopover');

        // NEW: Screenshot button is the first .command-item without id
        const commandItems = document.querySelectorAll('.command-item');
        this.screenshotButton = commandItems && commandItems[0];

    if (!this.statusDot || !this.skillIndicator || !this.micButton || !this.screenshotButton) {
            throw new Error('Required UI elements not found');
        }

        // Screenshot click handler
        this.screenshotButton.addEventListener('click', () => {
            if (this.isInteractive && window.electronAPI && window.electronAPI.takeScreenshot) {
                window.electronAPI.takeScreenshot();
            }
        });

        // Skill indicator click handler toggles DSA skill
        this.skillIndicator.addEventListener('click', () => {
            if (!this.isInteractive) return;
            const newSkill = 'dsa';
            if (window.electronAPI && window.electronAPI.updateActiveSkill) {
                window.electronAPI.updateActiveSkill(newSkill).then(() => {
                    this.handleSkillActivated(newSkill);
                });
            } else {
                this.handleSkillActivated(newSkill);
            }
        });

        // Check for required elements (settingsIndicator is optional)
        if (this.settingsIndicator) {
            this.settingsIndicator.addEventListener('click', () => {
                if (this.isInteractive) {
                    this.showSettingsMenu();
                }
            });
        }

        // Add click handler for microphone
        this.micButton.addEventListener('click', async () => {
            if (this._micTogglePending || this._isTranscribing) {
                return;
            }
            if (this.isInteractive && this.speechAvailable) {
                this._micTogglePending = true;
                this.updateMicButtonState();
                try {
                    const status = this.isRecording
                        ? await window.electronAPI.stopSpeechRecognition()
                        : await window.electronAPI.startSpeechRecognition();
                    if (status) {
                        this._isTranscribing = !!status.isFinalizing;
                        if (status.isRecording && !this.isRecording) {
                            this.handleRecordingStarted();
                        } else if (!status.isRecording && this.isRecording) {
                            this.handleRecordingStopped();
                        }
                    }
                } catch (error) {
                    logger.error('Speech recognition toggle failed', {
                        component: 'MainWindowUI',
                        error: error.message
                    });
                    this.handleRecordingStopped();
                } finally {
                    this._micTogglePending = false;
                    this.updateMicButtonState();
                }
            } else if (this.isInteractive && !this.speechAvailable) {
                logger.warn('Mic clicked but speech recognition is not available', {
                    component: 'MainWindowUI'
                });
                this.loadSpeechAvailability();
            }
        });

        // Language dropdown
        this.languageSelect = document.getElementById('codingLanguage');
        if (this.languageSelect) {
            // Set default to C++ if no value is set
            this.languageSelect.value = 'cpp';
            
            // Initialize with current setting
            if (window.electronAPI && window.electronAPI.getSettings) {
                window.electronAPI.getSettings().then(settings => {
                    if (settings && settings.codingLanguage) {
                        this.languageSelect.value = settings.codingLanguage;
                    } else {
                        // Save C++ as default if no language is set
                        this.languageSelect.value = 'cpp';
                        window.electronAPI.saveSettings({ codingLanguage: 'cpp' });
                    }
                }).catch(() => {
                    // Fallback to C++ on error
                    this.languageSelect.value = 'cpp';
                });
            }

            this.languageSelect.addEventListener('change', (e) => {
                const lang = e.target.value;
                if (window.electronAPI && window.electronAPI.saveSettings) {
                    window.electronAPI.saveSettings({ codingLanguage: lang });
                }
                // Resize for any width change
                setTimeout(() => {
                    const commandTab = document.querySelector('.command-tab');
                    if (commandTab && window.electronAPI && window.electronAPI.resizeWindow) {
                        const rect = commandTab.getBoundingClientRect();
                        window.electronAPI.resizeWindow(Math.ceil(rect.width), Math.ceil(rect.height));
                    }
                }, 50);
            });
        }

        // Whisper hardware status button / diagnostic popover
        if (this.whisperStatusButton && this.whisperStatusPopover) {
            this.whisperStatusButton.addEventListener('click', async (event) => {
                if (!this.isInteractive) return;
                event.stopPropagation();
                const isOpen = this.whisperStatusPopover.classList.contains('is-open');
                if (isOpen) {
                    this.hideWhisperStatusPopover();
                } else {
                    this.showWhisperStatusPopover();
                    await this.loadWhisperStatus(false);
                }
            });
            this.whisperStatusButton.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                this.whisperStatusButton.click();
            });

            if (this.whisperStatusTestButton) {
                this.whisperStatusTestButton.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    this.whisperStatusTestButton.disabled = true;
                    this.whisperStatusTestButton.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Testando…';
                    await this.loadWhisperStatus(true);
                    this.whisperStatusTestButton.disabled = false;
                    this.whisperStatusTestButton.innerHTML = '<i class="fas fa-vial"></i> Testar backend agora';
                });
            }

            document.addEventListener('click', (event) => {
                if (!this.whisperStatusPopover.classList.contains('is-open')) return;
                if (!this.whisperStatusPopover.contains(event.target) && !this.whisperStatusButton.contains(event.target)) {
                    this.hideWhisperStatusPopover();
                }
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.whisperStatusPopover.classList.contains('is-open')) {
                    this.hideWhisperStatusPopover();
                }
            });
        }

        // Info button / shortcuts popover
        if (this.infoButton && this.shortcutsPopover) {
            this.infoButton.addEventListener('click', (e) => {
                if (!this.isInteractive) return;
                e.stopPropagation();
                this.toggleShortcutsPopover();
            });

            // Hover to show
            this.infoButton.addEventListener('mouseenter', () => {
                if (!this.isInteractive) return;
                this.showShortcutsPopover();
            });
            // Queue hide when leaving the button
            this.infoButton.addEventListener('mouseleave', () => this.queueHideShortcutsPopover());

            // Keep open when hovering popover
            this.shortcutsPopover.addEventListener('mouseenter', () => {
                if (this._popoverHideTimeout) {
                    clearTimeout(this._popoverHideTimeout);
                    this._popoverHideTimeout = null;
                }
            });
            // Hide after a small delay when leaving popover
            this.shortcutsPopover.addEventListener('mouseleave', () => this.queueHideShortcutsPopover());

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!this.shortcutsPopover) return;
                const isClickInside = this.shortcutsPopover.contains(e.target) || this.infoButton.contains(e.target);
                if (!isClickInside && this.shortcutsPopover.classList.contains('is-open')) {
                    this.hideShortcutsPopover();
                }
            });

            // Close on Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.shortcutsPopover && this.shortcutsPopover.classList.contains('is-open')) {
                    this.hideShortcutsPopover();
                }
            });
        }
    }

    setupEventListeners() {
        if (window.electronAPI) {
            // Fix interaction mode change listener
            window.electronAPI.onInteractionModeChanged((event, interactive) => {
                logger.debug('Interaction mode changed received:', interactive);
                this.handleInteractionModeChanged(interactive);
            });

            window.electronAPI.onRecordingStarted(() => {
                this._isTranscribing = false;
                this.handleRecordingStarted();
            });

            window.electronAPI.onRecordingCaptureStopped(() => {
                this._isTranscribing = true;
                this.handleRecordingStopped();
                if (window.electronAPI.confirmAudioCaptureStopped) {
                    window.electronAPI.confirmAudioCaptureStopped();
                }
            });

            window.electronAPI.onRecordingStopped(() => {
                this._isTranscribing = false;
                this.handleRecordingStopped();
            });

            window.electronAPI.onTranscriptionProgress((_event, progress) => {
                // Periodic Whisper segments can run while audio capture is still
                // active; do not disable the stop button until finalization.
                this._isTranscribing = !!(progress && progress.finalizing);
                this.updateMicButtonState();
            });

            window.electronAPI.onSkillChanged((event, data) => {
                if (data && data.skill) {
                    this.handleSkillChanged(data);
                }
            });

            window.electronAPI.onSpeechAvailability((event, data) => {
                this.speechAvailable = !!(data && data.available);
                this.applyMicVisibility();
                this.loadWhisperStatus(false);
            });

            if (window.electronAPI.onSpeechStatus) {
                window.electronAPI.onSpeechStatus(() => {
                    this.loadWhisperStatus(false);
                });
            }

            // Listen for coding language changes from other windows
            window.electronAPI.onCodingLanguageChanged((event, data) => {
                if (data && data.language && this.languageSelect) {
                    // avoid clobbering if same value
                    if (this.languageSelect.value !== data.language) {
                        this.languageSelect.value = data.language;
                    }
                    logger.debug('Language updated from other window', {
                        component: 'MainWindowUI',
                        language: data.language
                    });
                }
            });

            // Listen for main window shown event to refresh speech availability
            window.electronAPI.onMainWindowShown(() => {
                logger.debug('Main window shown - refreshing speech availability', {
                    component: 'MainWindowUI'
                });
                this.loadSpeechAvailability();
            });
            
            // Global keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.altKey && e.key === 'r' && this.isInteractive) {
                    e.preventDefault();
                    if (!this.speechAvailable) return; // guard when unavailable
                    if (this.isRecording) {
                        window.electronAPI.stopSpeechRecognition();
                    } else {
                        window.electronAPI.startSpeechRecognition();
                    }
                }
            });
        }
        
        // Also listen via the api interface for backup
        if (window.api) {
            
            window.api.receive('interaction-mode-changed', (interactive) => {
                logger.debug('Interaction mode changed via api:', interactive);
                this.handleInteractionModeChanged(interactive);
            });
            
            window.api.receive('skill-updated', (data) => {
                logger.info('Skill updated event received from main process:', data);
                if (data && data.skill) {
                    this.handleSkillChanged(data);
                } else if (typeof data === 'string') {
                    // Handle case where skill is passed directly as string
                    this.handleSkillChanged({ skill: data });
                } else {
                    logger.warn('Skill updated event received but no skill data found:', data);
                }
            });
            
            // Listen for skill updates from settings window  
            window.api.receive('update-skill', (skill) => {
                logger.info('Direct skill update received from settings:', skill);
                this.handleSkillChanged({ skill: skill });
            });
        } else {
            logger.error('window.api not available - event listeners not set up!');
        }
        
        // Keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Settings shortcut
        this.setupSettingsShortcut();
    }

    handleLLMResponse(data) {
        const skill = data.skill || data.metadata?.skill || 'General';
        const skillNames = {
            'dsa': 'DSA',
            'behavioral': 'Behavioral', 
            'sales': 'Sales',
            'presentation': 'Presentation',
            'data-science': 'Data Science',
            'programming': 'Programming',
            'devops': 'DevOps',
            'system-design': 'System Design',
            'negotiation': 'Negotiation'
        };
        
        const displaySkill = skillNames[skill] || skill.toUpperCase();
        
        logger.info('LLM response received', {
            component: 'MainWindowUI',
            skill: skill,
            displaySkill: displaySkill
        });
    }

    handleLLMError(data) {
        logger.error('LLM error received', {
            component: 'MainWindowUI',
            error: data.error
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.metaKey && e.key === '\\') {
                this.isHidden = !this.isHidden;
                if (this.isHidden) {
                    this.showHiddenIndicator();
                }
            }
            
            // Handle Cmd + Arrow keys based on interaction mode
            if (e.metaKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();

                if (this.isInteractive) {
                    // Interactive mode: Cmd + Up/Down for skill navigation
                    if (e.key === 'ArrowUp') {
                        this.navigateSkill(-1); // Previous skill
                    } else if (e.key === 'ArrowDown') {
                        this.navigateSkill(1); // Next skill
                    } else {
                    }
                    // Left/Right arrows do nothing in interactive mode
                } else {
                    // Non-interactive mode: Cmd + Arrow keys for window movement
                    this.moveWindow(e.key);
                }
            }
            
            // Alt+A is handled globally by the main process
            // No need to handle it here since it needs to work even when windows are non-interactive
        });
    }

    handleInteractionModeChanged(interactive) {
        logger.info('Handling interaction mode change', {
            component: 'MainWindowUI',
            newState: interactive,
            previousState: this.isInteractive
        });
        
        // Update the internal state
        this.isInteractive = interactive;
        
        // Update all UI elements to reflect the new state
        this.updateAllElementStates();

        // Auto-hide popover when leaving interactive mode
        if (!this.isInteractive && this.shortcutsPopover && this.shortcutsPopover.style.display !== 'none') {
            this.hideShortcutsPopover();
        }
        
        // Update skill indicator tooltip
        this.updateSkillIndicator();
        
        logger.info('Interaction mode change completed', {
            component: 'MainWindowUI',
            interactive: this.isInteractive,
            statusDotClass: this.statusDot ? this.statusDot.className : 'not found',
            skillIndicatorClass: this.skillIndicator ? this.skillIndicator.className : 'not found'
        });
    }

    handleSkillChanged(data) {
        const oldSkill = this.currentSkill;
        this.currentSkill = data.skill;
        
        logger.info('Handling skill change', {
            component: 'MainWindowUI',
            oldSkill: oldSkill,
            newSkill: data.skill,
            skillIndicatorExists: !!this.skillIndicator
        });
        
        this.updateSkillIndicator();
        
        logger.info('Skill changed successfully', {
            component: 'MainWindowUI',
            skill: data.skill
        });
    }

    handleSkillActivated(skillName) {
        this.currentSkill = skillName;
        this.updateSkillIndicator();
        
        logger.info('Skill activated', {
            component: 'MainWindowUI',
            skill: skillName
        });
    }

    handleScreenshotRequest() {
        logger.debug('Screenshot request received', { component: 'MainWindowUI' });
    }

    handleRecordingStarted() {
        this._isTranscribing = false;
        if (this.isRecording && (this._captureStartPromise || this._audioContext || this._mediaStream)) {
            logger.debug('Duplicate recording-started event ignored', {
                component: 'MainWindowUI',
                captureActive: !!(this._audioContext || this._mediaStream),
                captureStarting: !!this._captureStartPromise
            });
            return;
        }
        this.isRecording = true;
        this._captureRestartCount = 0;
        if (this.micButton) {
            this.micButton.classList.add('recording');
        }
        // On Windows and macOS, Whisper audio is captured here in the renderer
        // (Web Audio API) rather than the main process: Windows lacks sox/rec/
        // arecord, and macOS avoids an unbundled Homebrew `sox`. Must match the
        // main process's useRendererCapture gate (speech.service.js). Linux uses
        // the native recorder. navigator.userAgentData is preferred when present
        // since navigator.platform is deprecated.
        const platform = (typeof navigator !== 'undefined' &&
          ((navigator.userAgentData && navigator.userAgentData.platform) ||
            navigator.platform || '')).toLowerCase();
        const useRendererCapture = platform.includes('win') || platform.includes('mac');
        if (useRendererCapture) {
            this._startRendererAudioCapture();
        }
        logger.debug('Recording started', { component: 'MainWindowUI' });
        this.updateMicButtonState();
    }

    handleRecordingStopped() {
        this.isRecording = false;
        if (this.micButton) {
            this.micButton.classList.remove('recording');
        }
        this._stopRendererAudioCapture();
        this.updateMicButtonState();
        logger.debug('Recording stopped', { component: 'MainWindowUI' });
    }

    /**
     * Capture microphone audio in the renderer using the Web Audio API.
     * This is used for Whisper on Windows where node-record-lpcm16's sox/rec
     * dependencies are unavailable.
     */
    _startRendererAudioCapture() {
        if (this._captureStartPromise) {
            return this._captureStartPromise;
        }
        if (this._audioContext || this._mediaStream || this._scriptNode) {
            logger.debug('Renderer audio capture already active', { component: 'MainWindowUI' });
            return Promise.resolve();
        }

        const generation = ++this._captureGeneration;
        const startPromise = (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: { ideal: 16000 }
                    }
                });

                if (!this.isRecording || generation !== this._captureGeneration) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                this._mediaStream = stream;

                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                const audioContext = new AudioContextClass({ sampleRate: 16000 });
                if (!this.isRecording || generation !== this._captureGeneration) {
                    await audioContext.close().catch(() => {});
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                this._audioContext = audioContext;
                this._captureStats = {
                    generation,
                    startedAt: Date.now(),
                    lastAudioProcessAt: 0,
                    lastLogAt: Date.now(),
                    loggedChunks: 0,
                    loggedBytes: 0,
                    totalChunks: 0,
                    totalBytes: 0
                };

                const source = audioContext.createMediaStreamSource(stream);
                const bufferSize = 4096;
                const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
                this._scriptNode = scriptNode;

                scriptNode.onaudioprocess = (event) => {
                    if (!this.isRecording || generation !== this._captureGeneration ||
                        !window.electronAPI || !window.electronAPI.sendAudioChunk) {
                        return;
                    }
                    const inputData = event.inputBuffer.getChannelData(0);
                    const pcm16 = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        const sample = Math.max(-1, Math.min(1, inputData[i]));
                        pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                    }

                    const stats = this._captureStats;
                    const now = Date.now();
                    if (stats && stats.generation === generation) {
                        stats.totalChunks += 1;
                        stats.totalBytes += pcm16.byteLength;
                        stats.lastAudioProcessAt = now;
                    }
                    try {
                        window.electronAPI.sendAudioChunk(pcm16.buffer);
                    } catch (error) {
                        logger.error('Failed to send renderer audio chunk', {
                            component: 'MainWindowUI',
                            error: error.message
                        });
                    }
                };

                audioContext.onstatechange = () => {
                    const state = audioContext.state;
                    logger.debug('Renderer audio context state changed', { component: 'MainWindowUI', state, generation });
                    if (state === 'suspended' && this.isRecording && generation === this._captureGeneration) {
                        audioContext.resume().then(() => {
                            logger.debug('Renderer audio context resumed', { component: 'MainWindowUI', generation });
                        }).catch((error) => {
                            logger.debug('Renderer audio context resume failed', { component: 'MainWindowUI', generation, error: error.message });
                        });
                    }
                };

                const audioTrack = stream.getAudioTracks && stream.getAudioTracks()[0];
                if (audioTrack && audioTrack.addEventListener) {
                    audioTrack.addEventListener('mute', () => {
                        logger.debug('Renderer microphone track muted', { component: 'MainWindowUI', generation });
                    });
                    audioTrack.addEventListener('unmute', () => {
                        logger.debug('Renderer microphone track unmuted', { component: 'MainWindowUI', generation });
                    });
                    audioTrack.addEventListener('ended', () => {
                        logger.debug('Renderer microphone track ended', { component: 'MainWindowUI', generation });
                        if (this.isRecording && generation === this._captureGeneration) {
                            this._restartRendererAudioCapture('microphone-track-ended');
                        }
                    });
                }

                source.connect(scriptNode);
                scriptNode.connect(audioContext.destination);
                this._startRendererCaptureWatchdog(generation);

                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                logger.info('Renderer audio capture started', { component: 'MainWindowUI', generation, audioContextState: audioContext.state });
            } catch (error) {
                if (!this.isRecording || generation !== this._captureGeneration) {
                    logger.debug('Renderer audio capture start cancelled', { component: 'MainWindowUI', generation });
                    return;
                }
                logger.error('Failed to start renderer audio capture', {
                    component: 'MainWindowUI',
                    error: error.message
                });
                try {
                    await window.electronAPI.stopSpeechRecognition();
                } catch (_) { /* ignore */ }
            }
        })();

        this._captureStartPromise = startPromise;
        startPromise.then(() => {
            if (this._captureStartPromise === startPromise) {
                this._captureStartPromise = null;
            }
        }, () => {
            if (this._captureStartPromise === startPromise) {
                this._captureStartPromise = null;
            }
        });
        return startPromise;
    }

    _startRendererCaptureWatchdog(generation) {
        if (this._captureWatchdog) {
            clearInterval(this._captureWatchdog);
        }
        if (this._captureStatsTimer) {
            clearInterval(this._captureStatsTimer);
        }
        this._captureWatchdog = setInterval(() => {
            this._checkRendererAudioCapture(generation);
        }, 1000);
        this._captureStatsTimer = setInterval(() => {
            this._logRendererCaptureHeartbeat();
        }, 1000);
    }

    _logRendererCaptureHeartbeat() {
        const stats = this._captureStats;
        if (!stats) {
            return;
        }
        const now = Date.now();
        const intervalMs = Math.max(1, now - stats.lastLogAt);
        const intervalChunks = stats.totalChunks - stats.loggedChunks;
        const intervalBytes = stats.totalBytes - stats.loggedBytes;
        logger.debug('Renderer audio capture heartbeat', {
            component: 'MainWindowUI',
            generation: stats.generation,
            totalChunks: stats.totalChunks,
            totalBytes: stats.totalBytes,
            intervalChunks,
            intervalBytes,
            chunksPerSecond: Number((intervalChunks * 1000 / intervalMs).toFixed(1)),
            lastChunkAgeMs: stats.lastAudioProcessAt ? now - stats.lastAudioProcessAt : null,
            audioContextState: this._audioContext ? this._audioContext.state : 'missing',
            restartCount: this._captureRestartCount
        });
        stats.lastLogAt = now;
        stats.loggedChunks = stats.totalChunks;
        stats.loggedBytes = stats.totalBytes;
    }

    async _checkRendererAudioCapture(generation) {
        if (!this.isRecording || generation !== this._captureGeneration || !this._captureStats) {
            return;
        }
        const now = Date.now();
        const stats = this._captureStats;
        const audioContext = this._audioContext;
        if (!audioContext) {
            return;
        }

        if (audioContext.state === 'suspended') {
            logger.debug('Renderer audio capture found suspended AudioContext', { component: 'MainWindowUI', generation });
            try {
                await audioContext.resume();
                logger.debug('Renderer audio capture resumed suspended AudioContext', { component: 'MainWindowUI', generation });
            } catch (error) {
                logger.debug('Renderer audio capture could not resume AudioContext', { component: 'MainWindowUI', generation, error: error.message });
            }
        }

        const lastActivityAt = stats.lastAudioProcessAt || stats.startedAt;
        const gapMs = now - lastActivityAt;
        if (gapMs > 1500 && !this._captureRestartPromise) {
            logger.debug('Renderer audio capture stall detected', { component: 'MainWindowUI', generation, gapMs, audioContextState: audioContext.state, totalChunks: stats.totalChunks });
            await this._restartRendererAudioCapture('no-audio-process-events');
        }
    }

    async _restartRendererAudioCapture(reason) {
        if (this._captureRestartPromise || !this.isRecording) {
            return;
        }
        if (this._captureRestartCount >= MAX_CAPTURE_RESTART_ATTEMPTS) {
            logger.error('Renderer audio capture restart limit reached', {
                component: 'MainWindowUI',
                reason,
                restartCount: this._captureRestartCount
            });
            this.handleRecordingStopped();
            return;
        }
        const restartPromise = (async () => {
            this._captureRestartCount += 1;
            logger.debug('Restarting renderer audio capture', { component: 'MainWindowUI', reason, restartCount: this._captureRestartCount });
            this._stopRendererAudioCapture();
            if (this.isRecording) {
                await this._startRendererAudioCapture();
            }
        })();
        this._captureRestartPromise = restartPromise;
        restartPromise.then(() => {
            if (this._captureRestartPromise === restartPromise) {
                this._captureRestartPromise = null;
            }
        }, () => {
            if (this._captureRestartPromise === restartPromise) {
                this._captureRestartPromise = null;
            }
        });
        return restartPromise;
    }

    _stopRendererAudioCapture() {
        this._captureGeneration += 1;
        if (this._captureWatchdog) {
            clearInterval(this._captureWatchdog);
            this._captureWatchdog = null;
        }
        if (this._captureStatsTimer) {
            clearInterval(this._captureStatsTimer);
            this._captureStatsTimer = null;
        }
        this._captureStartPromise = null;
        try {
            if (this._scriptNode) {
                this._scriptNode.disconnect();
                this._scriptNode.onaudioprocess = null;
                this._scriptNode = null;
            }
            if (this._mediaStream) {
                this._mediaStream.getTracks().forEach((track) => track.stop());
                this._mediaStream = null;
            }
            if (this._audioContext) {
                this._audioContext.onstatechange = null;
                this._audioContext.close().catch(() => {});
                this._audioContext = null;
            }
            this._captureStats = null;
        } catch (error) {
            logger.error('Error stopping renderer audio capture', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    updateSkillIndicator() {
        const skillNames = {
            'dsa': 'DSA',
            'behavioral': 'Behavioral', 
            'sales': 'Sales',
            'presentation': 'Presentation',
            'data-science': 'Data Science',
            'programming': 'Programming',
            'devops': 'DevOps',
            'system-design': 'System Design',
            'negotiation': 'Negotiation'
        };
        
        logger.info('Updating skill indicator', {
            component: 'MainWindowUI',
            currentSkill: this.currentSkill,
            skillIndicatorExists: !!this.skillIndicator
        });
        
        if (!this.skillIndicator) {
            logger.error('Skill indicator element not found!');
            return;
        }
        
        const skillName = skillNames[this.currentSkill] || this.currentSkill.toUpperCase();
        const skillSpan = this.skillIndicator.querySelector('span');
        
        logger.info('Looking for skill span element', {
            component: 'MainWindowUI',
            spanExists: !!skillSpan,
            skillName: skillName
        });
        
        if (skillSpan) {
            const oldText = skillSpan.textContent;
            skillSpan.textContent = skillName;
                        
            const tooltip = this.isInteractive ? 
                `${skillName} - Use ⌘↑/↓ to navigate skills` : 
                `${skillName} - Enable interactive mode (Alt+A) to navigate`;
            this.skillIndicator.title = tooltip;
            
            // Add visual feedback for skill change
            this.animateSkillChange();
            
            logger.info('Skill indicator updated successfully', {
                component: 'MainWindowUI',
                oldText: oldText,
                newText: skillName,
                interactive: this.isInteractive
            });
        } else {
            logger.error('Skill span element not found within skill indicator!');
        }
    }

    animateSkillChange() {
        if (this.skillIndicator) {
            this.skillIndicator.style.transform = 'scale(1.1)';
            this.skillIndicator.style.transition = 'transform 0.2s ease';
            
            setTimeout(() => {
                this.skillIndicator.style.transform = 'scale(1)';
            }, 200);
        }
    }

    navigateSkill(direction) {
        
        if (!this.isInteractive) {
            return;
        }
        
        const currentIndex = this.availableSkills.indexOf(this.currentSkill);
        if (currentIndex === -1) {
            logger.error('Current skill not found in available skills array');
            return;
        }
        
        // Calculate new index with wrapping
        let newIndex = currentIndex + direction;
        if (newIndex >= this.availableSkills.length) {
            newIndex = 0; // Wrap to beginning
        } else if (newIndex < 0) {
            newIndex = this.availableSkills.length - 1; // Wrap to end
        }
        
        const newSkill = this.availableSkills[newIndex];
        
        // Update skill locally and notify main process
        this.currentSkill = newSkill;
        this.updateSkillIndicator();
        
        // Save the skill change via IPC
        if (window.electronAPI && window.electronAPI.updateActiveSkill) {
            window.electronAPI.updateActiveSkill(newSkill).then(() => {
                logger.info('Skill navigation completed', {
                    component: 'MainWindowUI',
                    newSkill,
                    direction: direction > 0 ? 'down' : 'up'
                });
            }).catch(error => {
                logger.error('Failed to update skill via navigation', {
                    component: 'MainWindowUI',
                    error: error.message
                });
            });
        }
        
        // Show visual feedback
        this.showSkillChangeNotification(newSkill, direction);
    }

    showSkillChangeNotification(skill, direction) {
        const skillNames = {
            'dsa': 'DSA',
            'behavioral': 'Behavioral', 
            'sales': 'Sales',
            'presentation': 'Presentation',
            'data-science': 'Data Science',
            'programming': 'Programming',
            'devops': 'DevOps',
            'system-design': 'System Design',
            'negotiation': 'Negotiation'
        };
        
        const displayName = skillNames[skill] || skill.toUpperCase();
        const arrow = direction > 0 ? '↓' : '↑';
        
        // Create temporary notification
        const notification = document.createElement('div');
        notification.className = 'skill-change-notification';
        notification.innerHTML = `${arrow} ${displayName}`;
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 10);
        
        // Remove after 1 second
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 200);
        }, 1000);
    }

    showHiddenIndicator() {
        const indicator = document.querySelector('.hidden-indicator');
        if (indicator) {
            indicator.classList.add('show');
            setTimeout(() => {
                indicator.classList.remove('show');
            }, 3000);
        }
    }

    toggleInteractiveMode() {
        this.isInteractive = !this.isInteractive;
        this.updateAllElementStates();
        
        logger.debug('Interactive mode toggled', {
            component: 'MainWindowUI',
            interactive: this.isInteractive
        });
    }

    moveWindow(direction) {
        const moveDistance = 20; // pixels
        
        if (window.electronAPI && window.electronAPI.moveWindow) {
            let deltaX = 0, deltaY = 0;
            
            switch(direction) {
                case 'ArrowUp':
                    deltaY = -moveDistance;
                    break;
                case 'ArrowDown':
                    deltaY = moveDistance;
                    break;
                case 'ArrowLeft':
                    deltaX = -moveDistance;
                    break;
                case 'ArrowRight':
                    deltaX = moveDistance;
                    break;
            }
            
            window.electronAPI.moveWindow(deltaX, deltaY);
            logger.debug('Moving window', {
                component: 'MainWindowUI',
                direction: direction,
                deltaX: deltaX,
                deltaY: deltaY,
                interactive: this.isInteractive
            });
        } else {
            logger.warn('moveWindow API not available', { component: 'MainWindowUI' });
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg text-white z-50 ${
            type === 'error' ? 'bg-red-600' : 
            type === 'success' ? 'bg-green-600' :
            'bg-blue-600'
        }`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        logger.debug('Notification shown', {
            component: 'MainWindowUI',
            message,
            type
        });
    }

    async showGeminiConfig() {
        try {
            const status = await window.electronAPI.getGeminiStatus();
            
            const modal = this.createGeminiConfigModal(status);
            document.body.appendChild(modal);
            
            logger.debug('Gemini config modal shown', { component: 'MainWindowUI' });
        } catch (error) {
            logger.error('Failed to show Gemini config', {
                component: 'MainWindowUI',
                error: error.message
            });
            this.showNotification('Failed to load Gemini configuration', 'error');
        }
    }

    createGeminiConfigModal(status) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-900 text-white p-6 rounded-lg max-w-md w-full">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">🤖 Gemini Flash 1.5 Configuration</h2>
                    <button class="text-gray-400 hover:text-white" onclick="this.closest('.fixed').remove()">✕</button>
                </div>
                
                <div class="mb-4 p-3 rounded ${status.hasApiKey ? 'bg-green-900' : 'bg-red-900'}">
                    <p><strong>Status:</strong> ${status.hasApiKey ? 'Configured' : 'Not Configured'}</p>
                    <p><strong>Model:</strong> ${status.model}</p>
                </div>
                
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">API Key:</label>
                    <input type="password" id="geminiApiKey" placeholder="Enter your Gemini API key" 
                           class="w-full p-2 bg-gray-800 border border-gray-600 rounded text-white">
                    <p class="text-xs text-gray-400 mt-1">
                        Get your API key from: <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-blue-400">Google AI Studio</a>
                    </p>
                </div>
                
                <div class="flex space-x-2">
                    <button onclick="mainWindowUI.configureGemini()" class="flex-1 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">
                        Configure
                    </button>
                    <button onclick="mainWindowUI.testGeminiConnection()" class="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded">
                        Test Connection
                    </button>
                </div>
                
                <div class="mt-4 text-center">
                    <button class="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded" onclick="this.closest('.fixed').remove()">
                        Close
                    </button>
                </div>
            </div>
        `;
        return modal;
    }

    async configureGemini() {
        const apiKey = document.getElementById('geminiApiKey').value.trim();
        if (!apiKey) {
            this.showNotification('Please enter an API key', 'error');
            return;
        }
        
        try {
            const result = await window.electronAPI.setGeminiApiKey(apiKey);
            if (result.success) {
                this.showNotification('Gemini API key configured successfully!', 'success');
                document.querySelector('.fixed').remove();
                
                logger.info('Gemini API key configured', { component: 'MainWindowUI' });
            } else {
                this.showNotification(`Configuration failed: ${result.error}`, 'error');
                logger.error('Gemini configuration failed', {
                    component: 'MainWindowUI',
                    error: result.error
                });
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
            logger.error('Gemini configuration error', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    async testGeminiConnection() {
        try {
            const result = await window.electronAPI.testGeminiConnection();
            if (result.success) {
                this.showNotification('Gemini connection test successful!', 'success');
                logger.info('Gemini connection test successful', { component: 'MainWindowUI' });
            } else {
                this.showNotification(`Connection test failed: ${result.error}`, 'error');
                logger.error('Gemini connection test failed', {
                    component: 'MainWindowUI',
                    error: result.error
                });
            }
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
            logger.error('Gemini connection test error', {
                component: 'MainWindowUI',
                error: error.message
            });
        }
    }

    setupSettingsShortcut() {
        document.addEventListener('keydown', (e) => {
            // Cmd+, or Ctrl+, for settings
            if ((e.metaKey || e.ctrlKey) && e.key === ',') {
                logger.debug('Settings keyboard shortcut pressed');
                e.preventDefault();
                this.openSettings();
            }
        });
    }

    openSettings() {
        try {
            if (window.electronAPI && window.electronAPI.showSettings) {
                window.electronAPI.showSettings();
            } else {
                logger.error('electronAPI or showSettings not available');
                return;
            }
            
            // Add visual feedback
            if (this.settingsIndicator) {
                this.settingsIndicator.style.transform = 'scale(1.1)';
                this.settingsIndicator.style.transition = 'transform 0.2s ease';
                
                setTimeout(() => {
                    this.settingsIndicator.style.transform = 'scale(1)';
                }, 200);
            }
            
            logger.info('Settings window opened', { component: 'MainWindowUI' });
        } catch (error) {
            logger.error('Failed to open settings', {
                component: 'MainWindowUI',
                error: error.message
            });
            this.showNotification('Failed to open settings', 'error');
        }
    }

    showSettingsMenu() {
        const menu = document.createElement('div');
        menu.className = 'settings-menu';
        menu.style.cssText = `
            position: absolute;
            right: 10px;
            top: 35px;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(20px);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            padding: 8px 0;
            min-width: 150px;
            z-index: 1000;
        `;

        const settingsOption = this.createMenuItem('Settings', 'fa-cog', () => {
            this.openSettings();
            document.body.removeChild(menu);
        });

        const quitOption = this.createMenuItem('Quit OpenCluely', 'fa-power-off', () => {
            if (window.electronAPI && window.electronAPI.quit) {
                window.electronAPI.quit();
            }
        });

        menu.appendChild(settingsOption);
        menu.appendChild(this.createMenuSeparator());
        menu.appendChild(quitOption);

        // Add click outside listener to close menu
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && !this.settingsIndicator.contains(e.target)) {
                document.body.removeChild(menu);
                document.removeEventListener('click', closeMenu);
            }
        };
        document.addEventListener('click', closeMenu);

        document.body.appendChild(menu);
    }

    createMenuItem(text, iconClass, onClick) {
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 8px 16px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 13px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s ease;
        `;
        item.innerHTML = `<i class="fas ${iconClass}"></i>${text}`;
        item.addEventListener('mouseover', () => {
            item.style.background = 'rgba(255, 255, 255, 0.1)';
        });
        item.addEventListener('mouseout', () => {
            item.style.background = 'transparent';
        });
        item.addEventListener('click', onClick);
        return item;
    }

    createMenuSeparator() {
        const separator = document.createElement('div');
        separator.style.cssText = `
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
            margin: 8px 0;
        `;
        return separator;
    }

    showWhisperStatusPopover() {
        if (!this.whisperStatusPopover) return;
        this.whisperStatusPopover.classList.add('is-open');
        this.whisperStatusPopover.setAttribute('aria-hidden', 'false');
        this.whisperStatusButton?.setAttribute('aria-expanded', 'true');
        this.resizeWindowToContent();
    }

    hideWhisperStatusPopover() {
        if (!this.whisperStatusPopover) return;
        this.whisperStatusPopover.classList.remove('is-open');
        this.whisperStatusPopover.setAttribute('aria-hidden', 'true');
        this.whisperStatusButton?.setAttribute('aria-expanded', 'false');
        setTimeout(() => this.resizeWindowToContent(), 120);
    }

    toggleShortcutsPopover() {
        if (!this.shortcutsPopover) return;
    const isOpen = this.shortcutsPopover.classList.contains('is-open');
    if (!isOpen) {
            this.showShortcutsPopover();
        } else {
            this.hideShortcutsPopover();
        }
    }

    showShortcutsPopover() {
        if (!this.shortcutsPopover) return;
        if (this._popoverHideTimeout) {
            clearTimeout(this._popoverHideTimeout);
            this._popoverHideTimeout = null;
        }
    this.shortcutsPopover.classList.add('is-open');
        // Resize main window to fit popover
        setTimeout(() => this.resizeWindowToContent(), 50);
    }

    hideShortcutsPopover() {
        if (!this.shortcutsPopover) return;
    this.shortcutsPopover.classList.remove('is-open');
    // resize back to compact after transition
    setTimeout(() => this.resizeWindowToContent(), 130);
    }

    queueHideShortcutsPopover() {
        if (!this.shortcutsPopover) return;
        if (this._popoverHideTimeout) clearTimeout(this._popoverHideTimeout);
        this._popoverHideTimeout = setTimeout(() => this.hideShortcutsPopover(), 180);
    }
}

// Initialize when DOM is ready
let mainWindowUI;
if (typeof document !== 'undefined') {
    // Add immediate visual indicator that script is loading
    const style = document.createElement('style');
    document.head.appendChild(style);
    
    document.addEventListener('DOMContentLoaded', () => {
                
        mainWindowUI = new MainWindowUI();
        // Make it globally accessible for debugging
        window.mainWindowUI = mainWindowUI;
        logger.info('MainWindowUI initialized and available as window.mainWindowUI');
    });
}

// module.exports = MainWindowUI; // Not needed in browser context
