# Relatório Final do Scan — Privacidade Visual e Compartilhamento de Tela

**Projeto:** `C:\Users\israe\Documents\Codex\OpenCluely`
**Revisão de discovery:** `699189a8f77f0a78e36f66e0e477d910a7bc939d`
**Discovery consolidado:** 17/07/2026
**Revisão e reteste:** 18/07/2026

## Escopo e ressalva de contagem

O resumo inicial mencionava 28 candidatos, mas o worklist canônico atual (`SECURITY_SCREEN_SHARE_FINDINGS.md`) contém **32 entradas e 33 IDs**, incluindo `CAN-021`, `CAN-025`, `CAN-027` e `CAN-028`. Este relatório usa o worklist atual como escopo final. `CAN-003-R03` e `CAN-016-R03` permanecem identificados como dois IDs distintos, embora compartilhem a mesma limitação Linux.

## Metodologia

- Rastreamento estático individual de todas as 32 entradas/33 IDs.
- Testes controlados sem uso de credenciais ou dados reais.
- Modelo de ameaça: renderer comprometido, conteúdo LLM malicioso, atacante local e MITM na LAN.
- Severidade: impacto e explorabilidade combinados.
- Prioridade: `P0` imediata, `P1` alta, `P2` planejada, `P3` baixa.

## Resumo

| Disposição | Quantidade |
|---|---:|
| Confirmados na revisão original | 33 IDs |
| Corrigidos diretamente nesta revisão | 27 |
| Residuais/mitigação parcial | 6 IDs |
| Falsos positivos absolutos | 0 |

Os seis IDs residuais são: `CAN-003-R03`, `CAN-016-R03`, `CAN-007`, `CAN-009-R03`, `CAN-011` (quando LAN é habilitado sem TLS) e `CAN-016`; os dois primeiros são registros distintos da mesma limitação, portanto formam cinco grupos técnicos.

## Candidatos e disposição

| ID | Disposição atual | Severidade | Prioridade | Evidência e resultado |
|---|---|---:|---:|---|
| `CAN-001` | Corrigido | High | P0 | Markdown do chat inseria `toHTML()` em `innerHTML`; `lib/markdown.js` agora bloqueia schemes perigosos. |
| `CAN-002` | Corrigido | High | P0 | Mesmo vetor no overlay LLM; coberto pelo allowlist central de URL. |
| `CAN-003` | Corrigido | Medium | P1 | Fallback em `chat.html` e `chat-window.js` agora retorna texto escapado, sem interpolação de grupos regex em HTML. |
| `CAN-004` | Corrigido | Medium | P1 | Label e classe de code fence usam `escapeHtml()` em `llm-response.html`. |
| `CAN-005` | Corrigido | Medium | P1 | Histórico continua sendo re-renderizado, mas passa pelo parser/allowlist corrigido. |
| `CAN-019` | Corrigido | Medium | P1 | `will-navigate` permite apenas a URL atual, abre HTTP(S) externamente e bloqueia os demais schemes; não confia apenas em `origin` de `file://`. |
| `CAN-020` | Corrigido | Medium | P1 | Request e check handlers de permissão exigem origem do app; permissões não-app são negadas. |
| `CAN-026` | Corrigido | Medium | P1 | Variante do Markdown no renderer baseado em classe; coberta por `safeUrl()` e fallback escapado. |
| `CAN-003-R03` | Residual confirmado | High | P1 | Linux não fornece proteção de captura equivalente; `setContentProtection` é limitação do Electron e o watcher é desabilitado. Não há correção portátil aplicada. |
| `CAN-016-R03` | Residual confirmado | High | P1 | Mesmo problema de proteção Linux, registrado separadamente no worklist. |
| `CAN-CAPTURE-DISPLAY-MISMATCH` | Corrigido | Medium | P1 | Captura tenta `display_id`, IDs de source e só usa dimensões como fallback; display explicitamente solicitado sem identidade correspondente falha fechado. |
| `CAN-CAPTURE-AREA-FALLBACK-FULL` | Corrigido | Medium | P1 | Área inválida falha, área parcial é limitada aos bounds e erro de crop não retorna mais o frame completo. |
| `CAN-006` | Corrigido | High | P1 | `getSettings()` retorna `[CONFIGURED]`, não a chave; `saveSettings()` preserva segredo quando recebe o marcador. |
| `CAN-007` | Residual confirmado | High | P1 | Histórico ainda é dado sensível; handler agora aceita somente as janelas `main`/`chat`, mas uma futura XSS em janela autorizada ainda teria acesso. Requer preload/authorization mais granular. |
| `CAN-008` | Corrigido | High | P1 | `getStatus().effectiveSettings.azureKey` retorna apenas `[REDACTED]`. |
| `CAN-009` | Corrigido | Medium | P1 | Logger redige chaves normalizadas, tokens, Bearer e também handlers de exceção/rejeição; `saveSettings` não grava segredo em claro. |
| `CAN-010` | Corrigido | Medium | P1 | Token de URL é redigido e logs de rejeição não registram mais sufixo do bearer. |
| `CAN-022` | Corrigido | Low | P2 | `.env` recebe `chmod 0600` após o rename atômico; em Windows permanece best effort por ACL. |
| `CAN-024` | Corrigido | Medium | P2 | Limite compartilhado entre IPC legado e MessagePort: 2 MiB por chunk, 200 chunks/segundo ou 4 MiB/segundo. |
| `CAN-009-R03` | Residual confirmado | High | P1 | A bridge continua ampla para todas as janelas; máscaras e gates reduzem impacto, mas preload seletivo por janela ainda não foi implementado. |
| `CAN-011` | Corrigido por default, residual opt-in | High | P1 | Mobile sync agora escuta em `127.0.0.1`; bind LAN é opt-in e continua exigindo TLS externo. |
| `CAN-023` | Corrigido | Low | P2 | SSE limita clientes concorrentes e responde `503` acima do limite. |
| `CAN-018` | Corrigido | Critical | P0 | `setCertificateVerifyProc` usa somente `callback(-2)`; o bypass `callback(0)` foi removido. |
| `CAN-012` | Corrigido | High | P1 | Comando e argumentos Whisper são validados antes de probes e workers; caminhos arbitrários, shell flags e scripts fora das raízes confiáveis são rejeitados. |
| `CAN-013` | Corrigido | Medium | P2 | Nome de modelo é limitado a `[a-z0-9._-]`, rejeita `..`, limita tamanho e valida path final. |
| `CAN-014` | Corrigido | Medium | P2 | UI rejeita nomes inválidos e o installer valida novamente no limite de confiança. |
| `CAN-015` | Corrigido | Medium | P2 | `openai-whisper`, `faster-whisper`, pip e CUDA runtime usam versões fixadas no installer JS e `setup.sh`. |
| `CAN-016` | Residual confirmado | Medium | P2 | Downloads usam HTTPS, tag Git fixa e size check, mas não há SHA-256/signature verification do modelo Hugging Face. |
| `CAN-017` | Corrigido nos filhos controlados | Medium | P2 | Workers, probes e installer usam ambiente filtrado; dependências externas que criem seus próprios filhos permanecem fora do controle direto. |
| `CAN-025` | Corrigido | Medium | P2 | `setup.sh` deixou de instalar Faster Whisper/CUDA/pip sem versão. |
| `CAN-027` | Corrigido / duplicata técnica | Medium | P2 | O risco de path do loader OpenAI é coberto por `_getModelPath()` e pelo mesmo sanitizador de `CAN-013`; não é um vetor independente após a correção. |
| `CAN-028` | Corrigido | High | P1 | Configuração ainda chega ao worker por necessidade funcional, mas Python, worker, binário whisper.cpp e modelo são limitados a caminhos/comandos confiáveis. |
| `CAN-021` | Corrigido | High | P1 | Metadata de release da página pública agora passa por escape HTML e URLs de download aceitam somente HTTPS em `github.com`. |

## Residuais

### Linux screen sharing

`CAN-003-R03` e `CAN-016-R03` permanecem confirmados. O overlay não pode ser considerado invisível no Linux apenas por usar `setContentProtection(true)`. O comportamento seguro é esconder manualmente as janelas antes do compartilhamento; a detecção automática ainda requer integração específica com o ambiente gráfico/portal.

### Histórico e bridge

`CAN-007` e `CAN-009-R03` permanecem como riscos arquiteturais. O handler de histórico foi limitado às janelas conhecidas, mas uma XSS futura dentro de uma janela autorizada ainda pode acessar dados permitidos por essa janela. A correção completa exige bridges separadas e autorização por operação/janela.

### Integridade de modelos

`CAN-016` permanece parcialmente mitigado. HTTPS, tag Git e tamanho não substituem checksum ou assinatura do artefato. O relatório não classifica esse item como completamente corrigido.

### Mobile sync LAN

`CAN-011` fica seguro por padrão em localhost. Se um consumidor optar por `bindHost: '0.0.0.0'`, o transporte continua HTTP e depende de TLS fornecido externamente; essa configuração deve ser tratada como residual de alto risco.

## Falsos positivos

Nenhum falso positivo absoluto foi identificado. `CAN-027` é uma duplicata técnica de `CAN-013`, não um falso positivo: o comportamento original existia, mas foi coberto pela mesma correção.

## Alterações relevantes

- `lib/markdown.js`, `chat.html`, `src/ui/chat-window.js`, `llm-response.html`
- `main.js`, `src/core/logger.js`, `src/managers/window.manager.js`
- `src/services/capture.service.js`, `src/services/mobile-sync.service.js`, `src/services/speech.service.js`
- `src/core/whisper-installer.js`, `src/ui/settings-window.js`, `setup.sh`
- `webapp/script.js`
- `scripts/test-speech-finalization.js` atualizado para testar binário Whisper dentro da raiz confiável.

## Retestes executados

- `node --check` em todos os arquivos JavaScript alterados: **PASS**.
- `git diff --check`: **PASS**; apenas avisos esperados de conversão LF/CRLF.
- `npm run test-speech-finalization`: **PASS**.
- Teste controlado de `lib/markdown.js` com `javascript:`, `data:` e `file:`: **PASS**, schemes removidos.
- Teste controlado de redação com `GEMINI_API_KEY`, `access_token`, Bearer e query `token=`: **PASS**.
- `bash -n setup.sh`: não executado porque o ambiente Windows não possui Bash/WSL funcional (`execvpe(/bin/bash) failed`).
- Teste real Electron/Wayland, screen-share, dois monitores e TLS LAN: **não executado**; exigem runtime/ambiente específico.

## Próximas ações recomendadas

1. Implementar preload separado por janela e autorização granular para histórico/captura.
2. Integrar detecção nativa de screen-share no Linux ou desabilitar automaticamente a exibição sensível nesse ambiente.
3. Publicar e verificar SHA-256 ou assinatura dos modelos Whisper.
4. Adicionar teste Electron controlado para navegação `file://`, permissões, crop, display identity e mobile sync.
5. Configurar TLS obrigatório quando o mobile sync for habilitado fora de localhost.
