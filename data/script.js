// =======================================================
// COLE ESTE CÓDIGO COMPLETO NO SEU script.js
// =======================================================
let websocket;
const gateway = `ws://${window.location.hostname}/ws`;
let currentLanguage = 'en';
let consumptionChart = null;

const translations = {
    en: {
        main_title: "CapsuleCorp - Control Dashboard",
        connection_status: "ESP32 Connection",
        card_mode: "Operating Mode",
        card_motor_status: "Motor Status",
        card_pressure_status: "Pressure Status",
        pressure_status_on: "Pressurized",
        pressure_status_off: "No Pressure",
        card_flow_pulses: "Flow Rate (Pulses/s)",
        card_flow_lpm: "Flow Rate (L/min)",
        card_total_volume: "Total Volume (L)",
        card_threshold: "Flow Threshold",
        card_actions_title: "Actions & Settings",
        btn_switch_manual: "Set Manual Mode",
        btn_switch_auto: "Set Automatic Mode",
        btn_turn_on_motor: "Turn On Motor",
        btn_turn_off_motor: "Turn Off Motor",
        label_set_threshold: "Set Flow Threshold (Pulses):",
        btn_save: "Save",
        btn_reset_volume: "Reset Total Volume",
        confirm_reset: "Are you sure you want to reset the total volume?",
        btn_reset_history: "Reset Consumption History",
        confirm_reset_history: "Are you sure you want to permanently delete the consumption history? This action cannot be undone.",
        wifi_config_title: "Configure Wi-Fi",
        confirm_wifi_config: "This will disconnect the dashboard and start Wi-Fi setup mode. The ESP32 will create a network called 'Configurar-Bomba-WiFi'. Do you want to continue?",
        label_logic_mode: "Automatic Logic:",
        logic_mode_0: "Combined (Flow & Pressure)",
        logic_mode_1: "Flow Only",
        logic_mode_2: "Pressure Only",
        status_label: "System Status:",
        btn_enable_cooldown: "Enable Cooldown",
        btn_disable_cooldown: "Disable Cooldown",
        label_set_cooldown: "Set Cooldown Time (seconds):",
        label_set_off_delay: "Auto-Off Delay (seconds):",
        mode_manual: "Manual",
        mode_auto: "Automatic",
        motor_on: "ON",
        motor_off: "OFF",
        status_ready_manual: "Ready for manual control",
        status_awaiting_flow: "Waiting for water flow",
        status_awaiting_pressure: "Waiting for pressure drop",
        status_pump_on: "Pump On",
        status_pressurizing: "Pressurizing...",
        status_shutdown_noflow: "No flow, turning off in {time}s...",
        status_cooldown: "In Cooldown ({time}s)",
        status_unknown: "Waiting...",
        card_history: "Consumption History (Liters per Hour)",
        history_label: "Liters",
        label_set_protection_time: "Protection Time (no pressure, in sec):",
        btn_enable_protection: "Enable No-Pressure Protection",
        btn_disable_protection: "Disable No-Pressure Protection",
        history_tooltip: "Consumption"
    },
    pt: {
        main_title: "CapsuleCorp - Painel de Controle",
        connection_status: "Conexão ESP32",
        card_mode: "Modo de Operação",
        card_motor_status: "Status do Motor",
        card_pressure_status: "Status da Pressão",
        pressure_status_on: "Pressurizado",
        pressure_status_off: "Sem Pressão",
        card_flow_pulses: "Vazão (Pulsos/s)",
        card_flow_lpm: "Vazão (L/min)",
        card_total_volume: "Volume Total (L)",
        card_threshold: "Limiar de Vazão",
        card_actions_title: "Ações e Configurações",
        btn_switch_manual: "Ativar Modo Manual",
        btn_switch_auto: "Ativar Modo Automático",
        btn_turn_on_motor: "Ligar Motor",
        btn_turn_off_motor: "Desligar Motor",
        label_set_threshold: "Definir Limiar de Vazão (Pulsos):",
        btn_save: "Salvar",
        btn_reset_volume: "Zerar Volume Total",
        confirm_reset: "Deseja realmente zerar o volume total?",
        btn_reset_history: "Zerar Histórico de Consumo",
        confirm_reset_history: "Tem certeza que deseja apagar permanentemente o histórico de consumo? Esta ação não pode ser desfeita.",
        wifi_config_title: "Configurar Wi-Fi",
        confirm_wifi_config: "Isso irá desconectar o painel e iniciar o modo de configuração Wi-Fi. O ESP32 criará uma rede chamada 'Configurar-Bomba-WiFi'. Deseja continuar?",
        label_logic_mode: "Lógica Automática:",
        logic_mode_0: "Combinada (Vazão e Pressão)",
        logic_mode_1: "Somente Vazão",
        logic_mode_2: "Somente Pressão",
        status_label: "Status do Sistema:",
        btn_enable_cooldown: "Habilitar Cooldown",
        btn_disable_cooldown: "Desabilitar Cooldown",
        label_set_cooldown: "Definir Cooldown (segundos):",
        label_set_off_delay: "Atraso para Desligar (segundos):",
        mode_manual: "Manual",
        mode_auto: "Automático",
        motor_on: "LIGADO",
        motor_off: "DESLIGADO",
        status_ready_manual: "Pronto para controle manual",
        status_awaiting_flow: "Aguardando fluxo de água",
        status_awaiting_pressure: "Aguardando queda de pressão",
        status_pump_on: "Bomba Ligada",
        status_pressurizing: "Ligado, pressurizando...",
        status_shutdown_noflow: "Fluxo zero, desligando em {time}s...",
        status_cooldown: "Em Cooldown ({time}s)",
        status_unknown: "Aguardando...",
        card_history: "Histórico de Consumo (Litros por Hora)",
        history_label: "Litros",
        label_set_protection_time: "Tempo de Proteção (sem pressão, em seg):",
        btn_enable_protection: "Habilitar Proteção Sem Pressão",
        btn_disable_protection: "Desabilitar Proteção Sem Pressão",
        history_tooltip: "Consumo"
    }
};

const setLanguage = (lang) => {
    currentLanguage = lang;
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-translate-key]').forEach(el => {
        const key = el.getAttribute('data-translate-key');
        if (translations[lang][key]) { el.innerText = translations[lang][key]; }
    });
    localStorage.setItem('language', lang);
    document.getElementById('toggleLangBtn').innerText = lang === 'en' ? '🇧🇷' : '🇺🇸';
    if (consumptionChart) {
        initChart();
    }
};

const setTheme = (theme) => {
    document.body.classList.toggle('dark-theme', theme === 'dark');
    document.getElementById('toggleThemeBtn').innerText = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('theme', theme);
    if (consumptionChart) {
        initChart();
    }
};

const toggleTheme = () => setTheme(localStorage.getItem('theme') === 'dark' ? 'light' : 'dark');
const toggleLanguage = () => setLanguage(localStorage.getItem('language') === 'en' ? 'pt' : 'en');

window.addEventListener('load', () => {
    setTheme(localStorage.getItem('theme') || 'dark');
    setLanguage(localStorage.getItem('language') || 'pt');
    initWebSocket();
    initButtons();
    initChart();
});

const initWebSocket = function() {
    const statusEl = document.getElementById('connection-status');
    console.log("Iniciando conexão WebSocket...");
    
    websocket = new WebSocket(gateway);
    
    websocket.onopen = () => {
        console.log("WebSocket conectado com sucesso.");
        statusEl.classList.replace('disconnected', 'connected');
    };

    websocket.onclose = () => {
        console.log("WebSocket desconectado. Tentando reconectar em 2s...");
        statusEl.classList.replace('connected', 'disconnected');
        setTimeout(initWebSocket, 2000); 
    };
    
    websocket.onerror = (error) => {
        console.error("Erro no WebSocket:", error);
    };

    websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.event === 'reconnected') {
            console.log('Recebido evento de reconexão do ESP32.');
            showReconnectNotification();
        } else {
            updateUI(data);
        }
    };
};

const sendCommand = (payload) => {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(payload));
        return true;
    } else {
        console.warn("Comando não enviado: WebSocket não está conectado.", payload);
        return false;
    }
};

const initButtons = function(){
    document.getElementById('toggleProtectionBtn').addEventListener('click', () => sendCommand({ action: 'toggleProtection' }));
    document.getElementById('toggleThemeBtn').addEventListener('click', toggleTheme);
    document.getElementById('toggleLangBtn').addEventListener('click', toggleLanguage);
    document.getElementById('wifiConfigBtn').addEventListener('click', () => {
        if (confirm(translations[currentLanguage]['confirm_wifi_config'])) {
            if (sendCommand({ action: 'startConfigPortal' })) {
                alert("O ESP32 irá reiniciar em modo de configuração. Você será desconectado.");
            }
        }
    });

    document.getElementById('toggleModeBtn').addEventListener('click', () => sendCommand({action: 'toggleMode'}));
    document.getElementById('manualControlBtn').addEventListener('click', () => sendCommand({action: 'manualControl'}));

    document.getElementById('saveThresholdBtn').addEventListener('click', (event) => {
        const input = document.getElementById('minPulsosInput');
        if (input.value) {
            if (sendCommand({action: 'setThreshold', value: parseInt(input.value)})) {
                showSaveFeedback(event.target);
                input.value = '';
            }
        }
    });

    document.getElementById('resetTotalBtn').addEventListener('click', () => {
        if(confirm(translations[currentLanguage]['confirm_reset'])) {
            sendCommand({action: 'resetTotal'});
        }
    });

    document.getElementById('resetHistoryBtn').addEventListener('click', () => {
        if(confirm(translations[currentLanguage]['confirm_reset_history'])) {
            if(sendCommand({action: 'resetHistory'})) {
               setTimeout(initChart, 500); 
            }
        }
    });

    document.querySelectorAll('input[name="logicMode"]').forEach(radio => {
        radio.addEventListener('click', function() {
            sendCommand({ action: 'setLogicMode', value: parseInt(this.value) });
        });
    });

    document.getElementById('toggleCooldownBtn').addEventListener('click', () => sendCommand({ action: 'toggleCooldown' }));

    document.getElementById('saveCooldownBtn').addEventListener('click', (event) => {
        const input = document.getElementById('cooldownTimeInput');
        if (input.value && parseInt(input.value) > 0) {
            if (sendCommand({ action: 'setCooldownTime', value: parseInt(input.value) })) {
                showSaveFeedback(event.target);
                input.value = ''; 
            }
        }
    });

    document.getElementById('saveOffDelayBtn').addEventListener('click', (event) => {
        const input = document.getElementById('offDelayInput');
        if (input.value && parseInt(input.value) >= 0) {
            if (sendCommand({ action: 'setOffDelay', value: parseInt(input.value) })) {
                showSaveFeedback(event.target);
                input.value = '';
            }
        }
    });

        document.getElementById('saveProtectionTimeBtn').addEventListener('click', (event) => {
        const input = document.getElementById('protectionTimeInput');
        if (input.value && parseInt(input.value) > 0) {
            if (sendCommand({ action: 'setProtectionTime', value: parseInt(input.value) })) {
                showSaveFeedback(event.target);
                input.value = '';
            }
        }
    });
};

const showSaveFeedback = (button) => {
    const originalText = button.innerText;
    button.innerText = 'Salvo!';
    button.classList.add('saved');
    setTimeout(() => {
        button.innerText = originalText;
        button.classList.remove('saved');
    }, 1500);
};

const updateUI = function(data) {
    const lang = translations[currentLanguage];
    document.getElementById('mode').innerText = data.isAuto ? lang['mode_auto'] : lang['mode_manual'];
    document.getElementById('pulsos').innerText = data.pulsos;
    document.getElementById('minPulsos').innerText = data.minPulsos;
    document.getElementById('lpm').innerText = parseFloat(data.lpm).toFixed(2);
    document.getElementById('volumeTotal').innerText = parseFloat(data.volumeTotal).toFixed(2);
    const motorStateEl = document.getElementById('motorState');
    motorStateEl.innerText = data.motorOn ? lang['motor_on'] : lang['motor_off'];
    motorStateEl.className = data.motorOn ? 'value on' : 'value off';
    const pressureIndicator = document.getElementById('pressureIndicator');
    const pressureText = document.getElementById('pressureText');
    if (data.pressureState === 1) {
        pressureIndicator.classList.add('on');
        pressureText.innerText = lang['pressure_status_on'];
    } else {
        pressureIndicator.classList.remove('on');
        pressureText.innerText = lang['pressure_status_off'];
    }
    const toggleBtn = document.getElementById('toggleModeBtn');
    const manualControls = document.getElementById('manualControls');
    const manualBtn = document.getElementById('manualControlBtn');
    if (data.isAuto) {
        toggleBtn.innerText = lang['btn_switch_manual'];
        manualControls.classList.add('hidden');
    } else { 
        toggleBtn.innerText = lang['btn_switch_auto'];
        manualControls.classList.remove('hidden');
        manualBtn.innerText = data.motorOn ? lang['btn_turn_off_motor'] : lang['btn_turn_on_motor'];
        manualBtn.className = data.motorOn ? 'on' : 'off';
    }
    document.querySelector('input[name="logicMode"][value="' + data.autoLogicMode + '"]').checked = true;
    const statusEl = document.getElementById('systemStatus');
    if (data.statusKey && lang[data.statusKey]) {
        let statusText = lang[data.statusKey];
        if (statusText.includes('{time}')) {
            statusText = statusText.replace('{time}', data.statusValue + 1);
        }
        statusEl.innerText = statusText;
    }
    const toggleCooldownBtn = document.getElementById('toggleCooldownBtn');
    const cooldownSettings = document.getElementById('cooldownSettings');
    const cooldownTimeInput = document.getElementById('cooldownTimeInput');
    if (data.cooldownEnabled) {
        toggleCooldownBtn.innerText = lang['btn_disable_cooldown'];
        toggleCooldownBtn.className = 'on';
        cooldownSettings.classList.remove('hidden');
        cooldownTimeInput.placeholder = `Atual: ${data.cooldownDuration / 1000}s`;
    } else {
        toggleCooldownBtn.innerText = lang['btn_enable_cooldown'];
        toggleCooldownBtn.className = 'off';
        cooldownSettings.classList.add('hidden');
    }
    if (data.offDelay !== undefined) {
        document.getElementById('offDelayInput').placeholder = `Atual: ${data.offDelay / 1000}s`;
    }
    if (data.protectionTime !== undefined) {
        document.getElementById('protectionTimeInput').placeholder = `Atual: ${data.protectionTime / 1000}s`;
    }
    const toggleProtectionBtn = document.getElementById('toggleProtectionBtn');
    const protectionSettings = document.getElementById('protectionSettings');
    if (data.protectionEnabled) {
        toggleProtectionBtn.innerText = lang['btn_disable_protection'];
        toggleProtectionBtn.className = 'on';
        protectionSettings.classList.remove('hidden');
    } else {
        toggleProtectionBtn.innerText = lang['btn_enable_protection'];
        toggleProtectionBtn.className = 'off';
        protectionSettings.classList.add('hidden');
    }
};

const initChart = async () => {
    try {
        const response = await fetch('/history');
        if (!response.ok) return;
        const data = await response.json();
        const labels = data.map(item => {
            return new Date(item.time * 1000).toLocaleTimeString(currentLanguage === 'pt' ? 'pt-BR' : 'en-US', {
                hour: '2-digit', minute: '2-digit'
            });
        });
        const chartData = data.map(item => item.volume.toFixed(2));
        const ctx = document.getElementById('consumptionChart').getContext('2d');
        const isDark = document.body.classList.contains('dark-theme');
        const lang = translations[currentLanguage];
        if (consumptionChart) {
            consumptionChart.destroy();
        }
        consumptionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: lang['history_label'],
                    data: chartData,
                    backgroundColor: 'rgba(0, 123, 255, 0.6)',
                    borderColor: 'rgba(0, 123, 255, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: isDark ? '#E0E0E0' : '#2c3e50' },
                        grid: { color: isDark ? '#333' : '#e3e8ef' }
                    },
                    x: {
                        ticks: { color: isDark ? '#E0E0E0' : '#2c3e50' },
                        grid: { color: isDark ? '#333' : '#e3e8ef' }
                    }
                },
                plugins: {
                    legend: { labels: { color: isDark ? '#E0E0E0' : '#2c3e50' } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${lang['history_tooltip']}: ${context.raw} L`;
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Erro ao carregar o histórico:", error);
    }
};

const showReconnectNotification = () => {
    const notification = document.createElement('div');
    notification.className = 'reconnect-toast';
    notification.innerText = 'Conexão com o ESP32 restabelecida!';
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 500);
    }, 4000);
};