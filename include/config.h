#ifndef CONFIG_H
#define CONFIG_H

// =================================================================
// --- ARQUIVO DE CONFIGURAÇÃO CENTRAL DO PROJETO ---
// =================================================================

// --- CONFIGURE AQUI SUAS CREDENCIAIS DE WI-FI ---
// --- As credenciais de Wi-Fi agora são gerenciadas pelo WiFiManager ---
// const char* ssid = "SEU_WIFI";
// const char* password = "SUA_SENHA";

// --- Credenciais de Login para a Página Web ---
const char* http_user = "CapsuleCorp";
const char* http_pass = "KaKaroto133200-";

// --- Credenciais para Upload pela Rede (OTA) ---
const char* ota_hostname = "CapsuleCorp";
const char* ota_password = "KaKaroto133200-";

// --- Pinos de Conexão ---
const int pinoSensorFluxo = 25;
const int pinoTriac = 23;
const int pinoPressostato = 34;

// --- Lógica de Controle ---
// O valor inicial de minPulsosParaLigar é definido aqui, mas o valor
// da memória (Preferences) será usado após a inicialização.
int minPulsosParaLigar = 5;
const float pulsosPorLitro = 450.0;

// --- Lógica de Segurança de Login ---
const int maxTentativas = 5;          // Bloqueia após 5 tentativas erradas
const int tempoDeBloqueioMs = 300000;  // Bloqueia por 5 minutos (300 * 1000 ms)

// --- Intervalos de Temporização (em milissegundos) ---
const int intervaloDeVerificacao = 1000;   // 1 segundo
const int intervaloDeSalvamento = 300000;  // 5 minutos
const long intervaloDeLog = 3600000L;      // 1 hora

#endif // CONFIG_H