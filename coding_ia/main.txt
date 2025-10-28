// =================================================================
// --- VERSÃO COMPLETA E ESTÁVEL (LÓGICA DE REDE CORRIGIDA) ---
// =================================================================

// --- 1. INCLUSÃO DE BIBLIOTECAS ---
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <LittleFS.h>
#include <DNSServer.h>
#include <esp_task_wdt.h>
#include "config.h"

// =================================================================
// --- MODO DE DEBUG ---
// Mude para 'false' para desativar as mensagens de debug no Serial
// =================================================================
#define DEBUG_MODE false 

#if DEBUG_MODE
  #define DEBUG_PRINTLN(x) Serial.println(x)
  #define DEBUG_PRINT(x) Serial.print(x)
#else
  #define DEBUG_PRINTLN(x)
  #define DEBUG_PRINT(x)
#endif

// --- 2. DECLARAÇÃO DE VARIÁVEIS GLOBAIS ---
DNSServer dnsServer;
WiFiManager wm;
volatile bool isPortalActive = false;
Preferences preferences;
volatile int contadorDePulsos = 0;
bool isAutomaticMode = false;
bool manualMotorState = false;
bool motorLigado = false;
int pulsosAtuais = 0;
bool pressaoAtingida = false;
float litrosPorMinuto = 0.0;
double volumeTotal = 0.0;
unsigned long ultimoTempoVerificado = 0;
unsigned long ultimoTempoSalvo = 0;
unsigned long ultimoTempoWifi = 0;
unsigned long ultimoTempoLog = 0;
int autoLogicMode = 0;
unsigned long tempoMotorLigado = 0;
unsigned long tempoMotorDesligado = 0;
unsigned long cooldownDuration = 180000;
bool emCooldown = false;
bool isCooldownEnabled = true;
unsigned long tempoDesligamentoAposFluxoZero = 5000;
unsigned long tempoPrimeiroFluxoZero = 0;
double ultimoVolumeLog = 0.0;
IPAddress ipLoginFalhou;
int contadorLoginFalhou = 0;
unsigned long tempoBloqueio = 0;
unsigned long tempoMaximoSemPressao = 15000;
String securityAlertMessage = "";
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");
JsonDocument wsDoc;
bool isProtectionEnabled = false;

// --- 3. DEFINIÇÃO DAS FUNÇÕES ---
void IRAM_ATTR contaPulso() {
  contadorDePulsos++;
}

void salvarHistorico() {
  double consumoHora = volumeTotal - ultimoVolumeLog;
  ultimoVolumeLog = volumeTotal;
  preferences.putDouble("lastVolLog", ultimoVolumeLog);

  JsonDocument newEntry;
  newEntry["time"] = time(nullptr);
  newEntry["volume"] = consumoHora;

  File file = LittleFS.open("/history.json", "r");
  JsonDocument doc;
  if (file) {
    deserializeJson(doc, file);
    file.close();
  }

  JsonArray array = doc.as<JsonArray>();
  if (doc.isNull()) {
    array = doc.to<JsonArray>();
  }
  array.add(newEntry);

  while (array.size() > 24) {
    array.remove(0);
  }

  file = LittleFS.open("/history.json", "w");
  if (file) {
    serializeJson(doc, file);
    file.close();
    Serial.println("INFO: Histórico de consumo salvo com sucesso.");
  } else {
    Serial.println("ERRO: Falha ao abrir history.json para escrita.");
  }
}

void notifyClients() {
  wsDoc.clear();
  wsDoc["isAuto"] = isAutomaticMode;
  wsDoc["motorOn"] = motorLigado;
  wsDoc["pulsos"] = pulsosAtuais;
  wsDoc["minPulsos"] = minPulsosParaLigar;
  wsDoc["lpm"] = litrosPorMinuto;
  wsDoc["volumeTotal"] = volumeTotal;
  wsDoc["pressureState"] = pressaoAtingida ? 1 : 0;
  wsDoc["autoLogicMode"] = autoLogicMode;
  wsDoc["cooldownEnabled"] = isCooldownEnabled;
  wsDoc["cooldownDuration"] = cooldownDuration;
  wsDoc["offDelay"] = tempoDesligamentoAposFluxoZero;
  wsDoc["protectionTime"] = tempoMaximoSemPressao;
  wsDoc["protectionEnabled"] = isProtectionEnabled;
  
  String statusKey = "status_unknown";
  int statusValue = 0;
  if (motorLigado) {
    if (autoLogicMode == 0 && pulsosAtuais == 0 && tempoPrimeiroFluxoZero > 0) {
        statusKey = "status_shutdown_noflow";
        statusValue = (tempoDesligamentoAposFluxoZero - (millis() - tempoPrimeiroFluxoZero)) / 1000;
    } else if (autoLogicMode != 1 && !pressaoAtingida && (millis() - tempoMotorLigado < tempoMaximoSemPressao)) {
      statusKey = "status_pressurizing";
    } else {
      statusKey = "status_pump_on";
    }
  } else if (emCooldown && isCooldownEnabled) {
    statusKey = "status_cooldown";
    statusValue = (cooldownDuration - (millis() - tempoMotorDesligado)) / 1000;
  } else if (!isAutomaticMode) {
    statusKey = "status_ready_manual";
  } else {
    if (autoLogicMode == 2) {
      statusKey = "status_awaiting_pressure";
    } else {
      statusKey = "status_awaiting_flow";
    }
  }
  wsDoc["statusKey"] = statusKey;
  wsDoc["statusValue"] = statusValue;

  if (securityAlertMessage.length() > 0) {
    wsDoc["securityAlert"] = securityAlertMessage;
    securityAlertMessage = "";
  }

  String output;
  serializeJson(wsDoc, output);
  ws.textAll(output);
}

void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len) {
  if (type == WS_EVT_CONNECT) {
    Serial.println("INFO: Cliente WebSocket conectado.");
    
    JsonDocument doc;
    doc["event"] = "reconnected";
    String output;
    serializeJson(doc, output);
    client->text(output);

    notifyClients();
    
  } else if (type == WS_EVT_DISCONNECT) {
    Serial.println("INFO: Cliente WebSocket desconectado.");
  } else if (type == WS_EVT_DATA) {
    JsonDocument doc; // <<-- AQUI ESTÁ A CRIAÇÃO DO 'doc'
    DeserializationError error = deserializeJson(doc, (char*)data);
    if (error) {
      Serial.println("ERRO: Falha ao deserializar JSON do WebSocket.");
      return;
    }
    
    // TODA A SUA LÓGICA DE COMANDOS VEM AQUI DENTRO
    const char* action = doc["action"];

    if (strcmp(action, "toggleMode") == 0) {
      isAutomaticMode = !isAutomaticMode;
      // Se acabou de mudar PARA o modo manual, garante que o motor comece desligado.
      if (!isAutomaticMode) {
        manualMotorState = false;
      }
    }
    else if (strcmp(action, "manualControl") == 0) {
      if (!isAutomaticMode) {
        manualMotorState = !manualMotorState;
      }
    }
    else if (strcmp(action, "setThreshold") == 0) {
      minPulsosParaLigar = doc["value"];
      preferences.putUInt("minPulsos", minPulsosParaLigar);
    }
    else if (strcmp(action, "resetTotal") == 0) {
      volumeTotal = 0.0;
      preferences.putDouble("volumeTotal", volumeTotal);
    }
    else if (strcmp(action, "setLogicMode") == 0) {
      autoLogicMode = doc["value"];
      preferences.putInt("autoLogic", autoLogicMode);
    }
    else if (strcmp(action, "toggleCooldown") == 0) {
      isCooldownEnabled = !isCooldownEnabled;
      preferences.putBool("cooldownOn", isCooldownEnabled);
    }
    else if (strcmp(action, "setCooldownTime") == 0) {
      cooldownDuration = doc["value"].as<unsigned long>() * 1000;
      preferences.putULong("cooldownTime", cooldownDuration);
    }
    else if (strcmp(action, "setOffDelay") == 0) {
      tempoDesligamentoAposFluxoZero = doc["value"].as<unsigned long>() * 1000;
      preferences.putULong("offDelay", tempoDesligamentoAposFluxoZero);
    }
    else if (strcmp(action, "resetHistory") == 0) {
      if (File file = LittleFS.open("/history.json", "w")) {
        file.print("[]");
        file.close();
        Serial.println("INFO: Histórico de consumo foi zerado.");
      }
    }
    else if (strcmp(action, "startConfigPortal") == 0) {
      preferences.putBool("startPortal", true);
      Serial.println("AÇÃO: Pedido para iniciar portal recebido. Reiniciando em modo de configuração...");
      delay(500);
      ESP.restart();
    }
    else if (strcmp(action, "setProtectionTime") == 0) {
      tempoMaximoSemPressao = doc["value"].as<unsigned long>() * 1000;
      preferences.putULong("protTime", tempoMaximoSemPressao);
    }
    else if (strcmp(action, "toggleProtection") == 0) {
      isProtectionEnabled = !isProtectionEnabled;
      preferences.putBool("protOn", isProtectionEnabled);
    }
    
    notifyClients();
  }
}

// --- 4. FUNÇÃO SETUP ---
void setup() {
  Serial.begin(115200);
  Serial.println("\n\nINFO: Sistema IoT-ASF iniciando...");

  DEBUG_PRINTLN("Tentando inicializar o LittleFS...");
  if(!LittleFS.begin(true)){
    Serial.println("ERRO FATAL: Falha ao montar o sistema de arquivos LittleFS. O sistema será paralisado.");
    while(1); // Trava o microcontrolador aqui para vermos o erro claramente.
    return;
  }
  DEBUG_PRINTLN("LittleFS inicializado com sucesso.");

  preferences.begin("bomba_app", false);
  minPulsosParaLigar = preferences.getUInt("minPulsos", 5);
  volumeTotal = preferences.getDouble("volumeTotal", 0.0);
  autoLogicMode = preferences.getInt("autoLogic", 0);
  isCooldownEnabled = preferences.getBool("cooldownOn", true);
  cooldownDuration = preferences.getULong("cooldownTime", 180000);
  tempoDesligamentoAposFluxoZero = preferences.getULong("offDelay", 5000);
  ultimoVolumeLog = preferences.getDouble("lastVolLog", volumeTotal);
  tempoMaximoSemPressao = preferences.getULong("protTime", 15000);
  isProtectionEnabled = preferences.getBool("protOn", false);
  DEBUG_PRINTLN("Preferências carregadas.");

  pinMode(pinoTriac, OUTPUT);
  digitalWrite(pinoTriac, LOW);
  pinMode(pinoSensorFluxo, INPUT_PULLUP);
  pinMode(pinoPressostato, INPUT);
  attachInterrupt(digitalPinToInterrupt(pinoSensorFluxo), contaPulso, FALLING);
  DEBUG_PRINTLN("Pinos e interrupções configurados.");

  // --- LÓGICA DE CONEXÃO FINAL E ROBUSTA ---

  // 1. INICIA O PONTO DE ACESSO (AP) PRIMEIRO E SEMPRE (PLANO B)
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP("IoT-ASF-Painel", "KaKaroto133200-");
  dnsServer.start(53, "*", WiFi.softAPIP());
  Serial.println("----------------------------------------------------");
  Serial.println("INFO: Ponto de Acesso de segurança 'IoT-ASF-Painel' ATIVO.");
  Serial.print("      IP Fixo (Plano B): http://");
  Serial.println(WiFi.softAPIP());
  Serial.println("----------------------------------------------------");
  DEBUG_PRINTLN("Modo AP configurado.");

  // 2. AGORA, TENTA CONECTAR À REDE LOCAL (PLANO A)
  bool forcePortal = preferences.getBool("startPortal", false);

  if (forcePortal) {
    Serial.println("INFO: Flag de portal encontrada. Iniciando configuração da rede local...");
    preferences.putBool("startPortal", false); 
    if (wm.startConfigPortal("Configurar-IoT-ASF", "KaKaroto133200-")) {
        // Se a configuração foi bem-sucedida, reinicia para garantir um estado limpo.
        Serial.println("INFO: Rede configurada com sucesso! Reiniciando o dispositivo...");
        delay(1000);
        ESP.restart();
    } else {
        Serial.println("AVISO: Portal esgotou o tempo. Reiniciando...");
        delay(1000);
        ESP.restart();
    }
  } else {
    // Tenta se conectar silenciosamente com as credenciais salvas
    wm.setConfigPortalTimeout(60); // Define um timeout para não bloquear para sempre
    if(!wm.autoConnect()) {
       Serial.println("AVISO: Não foi possível conectar automaticamente. O dispositivo está apenas em modo Ponto de Acesso.");
    }
  }
  DEBUG_PRINTLN("Gerenciador de Wi-Fi concluído.");

  // 3. REPORTA O STATUS FINAL DA CONEXÃO LOCAL
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("INFO: Conexão à rede local ATIVA.");
    Serial.print("      Acesse pelo IP da sua rede (Plano A): http://");
    Serial.println(WiFi.localIP());
    Serial.println("----------------------------------------------------");
  } else {
    Serial.println("AVISO: Conexão à rede local INATIVA.");
    Serial.println("----------------------------------------------------");
  }

  // --- INICIALIZAÇÃO DE TODOS OS OUTROS SERVIÇOS ---
  configTime(-3 * 3600, 0, "pool.ntp.org");
  ArduinoOTA.setHostname(ota_hostname);
  ArduinoOTA.setPassword(ota_password);
  ArduinoOTA.onStart([]() { Serial.println("INFO: Iniciando atualização OTA..."); esp_task_wdt_delete(NULL); })
            .onEnd([]() { Serial.println("INFO: Atualização OTA finalizada."); esp_task_wdt_add(NULL); })
            .onError([](ota_error_t error) { Serial.println("ERRO: Falha na atualização OTA."); esp_task_wdt_add(NULL); });
  ArduinoOTA.begin();
  Serial.println("INFO: Receptor OTA pronto!");

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);
  DEBUG_PRINTLN("WebSocket configurado.");

  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    if (request->client()->remoteIP() == ipLoginFalhou && millis() < tempoBloqueio) {
      request->send(401, "text/plain", "Muitas tentativas de login falharam. Aguarde 5 minutos.");
      return;
    }
    if(!request->authenticate(http_user, http_pass)) {
      if (request->client()->remoteIP() == ipLoginFalhou) {
        contadorLoginFalhou++;
      } else {
        ipLoginFalhou = request->client()->remoteIP();
        contadorLoginFalhou = 1;
      }
      if (contadorLoginFalhou >= maxTentativas) {
        tempoBloqueio = millis() + tempoDeBloqueioMs;
        Serial.println("ALERTA: IP " + ipLoginFalhou.toString() + " bloqueado por 5 minutos.");
      }
      return request->requestAuthentication();
    }
    if (request->client()->remoteIP() == ipLoginFalhou) {
        contadorLoginFalhou = 0;
        tempoBloqueio = 0;
    }
    request->send(LittleFS, "/index.html", "text/html");
  });

  server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request){ request->send(LittleFS, "/style.css", "text/css"); });
  server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request){ request->send(LittleFS, "/script.js", "text/javascript"); });
  server.on("/history", HTTP_GET, [](AsyncWebServerRequest *request){ request->send(LittleFS, "/history.json", "application/json"); });
  server.on("/favicon.ico", HTTP_GET, [](AsyncWebServerRequest *request){ request->send(204); });
  DEBUG_PRINTLN("Rotas do servidor web configuradas.");

  esp_task_wdt_init(15, true);
  esp_task_wdt_add(NULL);
  Serial.println("INFO: Watchdog Timer de seguranca ativado.");

  DEBUG_PRINTLN("Tentando iniciar o servidor web...");
  server.begin();
  Serial.println("INFO: Servidor Web iniciado. O sistema está pronto!");
}

// --- 5. FUNÇÃO LOOP ---// 
void loop() {
  // Mova o reset do Watchdog para o início do loop.
  // Isso garante que ele seja "alimentado" imediatamente,
  // evitando resets se outras funções demorarem para executar.
  esp_task_wdt_reset();

  if (WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA) {
    dnsServer.processNextRequest();
  }

  ArduinoOTA.handle();
  ws.cleanupClients();

  // A lógica de reconexão automática foi removida daqui, pois o WiFiManager já lida com isso.
  // Manter uma verificação simples é opcional, mas pode causar conflitos.
  // O modo AP+STA é a principal forma de recuperação.

  if (millis() - ultimoTempoVerificado >= intervaloDeVerificacao) {
    noInterrupts(); pulsosAtuais = contadorDePulsos; contadorDePulsos = 0; interrupts();
    
    if (isCooldownEnabled && emCooldown && (millis() - tempoMotorDesligado > cooldownDuration)) {
      emCooldown = false;
      Serial.println("INFO: Cooldown do motor finalizado.");
    }
    
    pressaoAtingida = (digitalRead(pinoPressostato) == HIGH);
    litrosPorMinuto = ((float)pulsosAtuais / pulsosPorLitro) * 60.0;
    volumeTotal += (float)pulsosAtuais / pulsosPorLitro;
    
    bool estadoDesejadoDoMotor = motorLigado;
    if (isAutomaticMode) {
      switch (autoLogicMode) {
        case 0:
          if (!motorLigado && !pressaoAtingida && !emCooldown) {
            estadoDesejadoDoMotor = true;
          }
          else if (motorLigado) {
            if (pulsosAtuais == 0) {
              if (tempoPrimeiroFluxoZero == 0) {
                tempoPrimeiroFluxoZero = millis();
              }
            } else {
              tempoPrimeiroFluxoZero = 0;
            }
            if (tempoPrimeiroFluxoZero > 0 && (millis() - tempoPrimeiroFluxoZero >= tempoDesligamentoAposFluxoZero)) {
              estadoDesejadoDoMotor = false;
            }
          }
          break;

        case 1:
          if (!motorLigado && (pulsosAtuais >= minPulsosParaLigar) && !emCooldown) { estadoDesejadoDoMotor = true; }
          else if (motorLigado && (pulsosAtuais == 0)) { estadoDesejadoDoMotor = false; }
          break;

        case 2:
          if (!pressaoAtingida && !motorLigado && !emCooldown) { estadoDesejadoDoMotor = true; }
          else if (pressaoAtingida && motorLigado) { estadoDesejadoDoMotor = false; }
          break;
      }
      
      if ( isProtectionEnabled && (autoLogicMode == 0 || autoLogicMode == 2) && motorLigado && !pressaoAtingida && (millis() - tempoMotorLigado > tempoMaximoSemPressao)) {
        estadoDesejadoDoMotor = false;
        Serial.println("ALERTA: Desligando por falta de pressão (proteção).");
      }

    } else {
      estadoDesejadoDoMotor = manualMotorState;
    }
    
    if (estadoDesejadoDoMotor != motorLigado) {
      motorLigado = estadoDesejadoDoMotor;
      digitalWrite(pinoTriac, motorLigado);
      if (motorLigado) {
        tempoMotorLigado = millis();
        tempoPrimeiroFluxoZero = 0;
        Serial.println("AÇÃO: Motor LIGADO.");
      } else {
        tempoMotorDesligado = millis();
        if (isCooldownEnabled) { emCooldown = true; Serial.println("AÇÃO: Motor DESLIGADO. Cooldown iniciado."); }
        else { emCooldown = false; Serial.println("AÇÃO: Motor DESLIGADO. (Cooldown desabilitado)"); }
      }
    }
    notifyClients();

    ultimoTempoVerificado = millis();
  }

  if (millis() - ultimoTempoSalvo >= intervaloDeSalvamento) {
    preferences.putDouble("volumeTotal", volumeTotal);
    ultimoTempoSalvo = millis();
  }
  
  if (millis() - ultimoTempoLog >= intervaloDeLog) {
    salvarHistorico();
    ultimoTempoLog = millis();
  }
}