# Auditoria de segurança: exposição ao mostrar ou compartilhar a tela

Data da consolidação: 17/07/2026
Repositório: `C:\Users\israe\Documents\Codex\OpenCluely`
Revisão analisada: `699189a8f77f0a78e36f66e0e477d910a7bc939d`

## Conclusão provisória

O código não pode ser considerado totalmente protegido contra visualização por terceiros. Uma ferramenta externa de captura de tela sempre consegue gravar pixels que o sistema operacional entrega ao monitor; portanto, a proteção precisa impedir que conteúdo sensível seja renderizado, enviado, persistido ou permaneça visível durante compartilhamento.

As análises encontraram candidatos fortes em quatro áreas diretamente relacionadas à privacidade visual:

- o overlay pode continuar visível ou ser capturado em alguns fluxos, especialmente no Linux;
- a seleção de monitor e de área capturada pode enviar pixels diferentes ou mais amplos que o pretendido;
- transcripts, OCR, respostas e metadados podem sair por sincronização LAN em HTTP sem TLS;
- respostas renderizadas e IPCs privilegiados podem permitir comprometimento do renderer, leitura de credenciais e controle de captura/overlay.

Também foram encontrados problemas adjacentes de transporte TLS, logs de segredos, permissões Electron, execução de processos e página de downloads.

**Importante:** esta consolidação reúne descobertas de *discovery*. Elas são candidatos baseados em rastreamento estático e ainda exigem validação central individual antes de serem classificadas como vulnerabilidades confirmadas.

## Cobertura e agentes

- 3 rodadas independentes de descoberta.
- 101/101 itens do worklist revisados em cada rodada válida.
- Rodada 1: 21 candidatos canônicos consolidados.
- Rodada 2: 7 candidatos novos, totalizando 28 canônicos.
- Rodada 3: 68 registros independentes adicionais; vários repetem os 28 canônicos e foram mantidos abaixo para preservar tudo o que os agentes observaram.
- Nenhum arquivo da aplicação foi alterado.
- Todos os agents que não seriam mais usados foram encerrados. Os agents que já não existiam retornaram `not found`; os dois ainda pendentes foram fechados explicitamente.

## Candidatos canônicos consolidados

### Renderização, overlay e conteúdo que pode aparecer na tela

1. **CAN-001 — Markdown ativo no chat** — `chat.html:916`, `lib/markdown.js:928-932`, `src/ui/chat-window.js`. Links de respostas podem chegar ao HTML sem uma allowlist de esquemas. O candidato pode permitir comportamento ativo no renderer do chat e expor bridge, histórico, captura ou configurações.

2. **CAN-002 — Markdown ativo na resposta LLM** — `llm-response.html:837,880-883`, `lib/markdown.js`, `window.manager`. O overlay de resposta também renderiza markdown de origem externa/modelo e pode carregar links/esquemas perigosos.

3. **CAN-003 — Fallback de texto do chat sem escape suficiente** — `chat.html:934-951`. O caminho de fallback do texto do assistente pode inserir conteúdo sem a mesma proteção do parser principal.

4. **CAN-004 — Token de linguagem de code fence em `innerHTML`** — `llm-response.html:759-769,847-855`. O rótulo de linguagem pode ser interpolado em HTML do overlay.

5. **CAN-005 — Histórico persistido re-renderizado de forma insegura** — `chat.html:806-830`. Conteúdo salvo pode reentrar no mesmo pipeline de HTML sem sanitização adicional.

6. **CAN-019 — Política de navegação aceita esquemas além de HTTP/HTTPS** — `src/managers/window.manager.js:486-501`. A abertura de esquemas não estritamente permitidos pode transformar resposta renderizada em navegação ativa.

7. **CAN-020 — Handlers globais de câmera/microfone/display capture sem autorização por origem** — `main.js:381-397`, `src/ui/main-window.js:940-959`. Um renderer comprometido ou navegação inesperada pode obter capacidades de mídia/captura sem decisão específica por origem.

8. **CAN-026 — Markdown ativo no renderer baseado em classe** — `src/ui/chat-window.js`, `lib/markdown.js`. É uma variante adicional do risco de renderização insegura no chat.

9. **CAN-003-R03 / CAN-016-R03 — Proteção de compartilhamento indisponível ou incompleta no Linux** — `src/managers/window.manager.js:574-580,849-861,913-935`. Os agentes observaram que o caminho Linux pode deixar o overlay visível e que não há proteção/detecção automática equivalente para impedir a captura do conteúdo sensível.

10. **CAN-CAPTURE-DISPLAY-MISMATCH — Monitor selecionado pode resolver para a fonte errada** — `main.js:574-576`, `src/services/capture.service.js:72-100`, `main.js:1213-1237`. A escolha por dimensões da thumbnail, em vez de `source.id`/`display_id`, pode capturar outro monitor com resolução igual.

11. **CAN-CAPTURE-AREA-FALLBACK-FULL — Crop inválido pode retornar a imagem inteira** — `main.js:574-576`, `src/services/capture.service.js:40-50`, `main.js:1213-1237`. Um erro de recorte pode enviar mais pixels do que o usuário selecionou, inclusive janelas ou segredos de outras áreas.

### IPC, credenciais e histórico

12. **CAN-006 — `getSettings` expõe chaves Azure/Gemini** — `preload.js:58-59`, `main.js:884,1803-1825`. O retorno de configurações inclui segredos para qualquer renderer que consiga usar a bridge.

13. **CAN-007 — `getSessionHistory` expõe OCR, transcripts e respostas** — `preload.js:43-46`, `main.js:755`, `src/managers/session.manager.js:495-515`. Histórico de conteúdo de tela e áudio pode ser lido por um renderer comprometido.

14. **CAN-008 — Status de fala retorna chave Azure** — `main.js:614-622`, `src/services/speech.service.js:1732-1750`, `preload.js:10-12`. O caminho de status pode devolver material secreto desnecessariamente.

15. **CAN-009 — Salvamento de configurações grava API keys em logs** — `main.js:2012-2015`, `src/core/logger.js:17-20,36-48`. Leitores locais, backups, coleta de crash ou outro processo podem recuperar credenciais.

16. **CAN-010 — Token de sincronização móvel aparece em logs** — `main.js:265-271`, `src/services/mobile-sync.service.js:57-81`. O bearer token pode ser recuperado do log e usado para ler o feed.

17. **CAN-022 — Substituição atômica de `.env` pode perder permissões restritivas** — `src/core/first-run.js:54-56`, `main.js:2087-2091`. A troca de arquivo pode não preservar as permissões esperadas dos segredos locais.

18. **CAN-024 — IPC de áudio sem limite rígido de tamanho/frequência** — caminho de áudio em `preload.js`/`main.js`. Um renderer comprometido pode enviar payloads excessivos, afetando disponibilidade e processamento de dados.

19. **CAN-009-R03 — Todas as renderers recebem uma bridge IPC ampla** — `src/managers/window.manager.js:315-320`, `preload.js:42-64`, `main.js:1796-1825`. A combinação de credenciais, captura, histórico, processos e controle de overlay amplia o impacto de qualquer comprometimento de conteúdo.

### Rede e sincronização

20. **CAN-011 — Mobile sync em HTTP/SSE claro em `0.0.0.0`** — `src/services/mobile-sync.service.js:35-142`, `main.js:1659-1677`. Transcripts, respostas LLM, OCR e metadados podem atravessar a LAN sem TLS.

21. **CAN-023 — SSE móvel sem limite de clientes** — `src/services/mobile-sync.service.js:84-125`. Conexões persistentes podem ser acumuladas e degradar a disponibilidade do serviço.

22. **CAN-018 — Verificação de certificado Gemini aceita qualquer certificado** — `main.js:366-373`, `src/services/llm.service.js:952-960,1410-1423`. Um MITM pode observar/alterar chave, prompts, screenshots, OCR, transcripts e respostas.

### Execução local, Whisper e cadeia de dependências

23. **CAN-012 — Comando Whisper controlado pelo renderer chega à execução de processo** — `main.js:985-986,1873-1886`, `src/services/speech.service.js:2928-2935,3802-3823`. Após comprometimento do renderer, pode haver seleção de executável local.

24. **CAN-013 — Nome do modelo Whisper influencia caminho de arquivo** — `preload.js:68`, `main.js:969-977`, `src/core/whisper-installer.js:572-587,864-870`. Entrada não restringida pode permitir traversal ou gravação fora do diretório esperado.

25. **CAN-014 — Seletor livre de modelo Whisper chega ao loader de terceiros** — `src/ui/settings-window.js:470-474`, `src/services/speech.service.js:2498-2506`, worker Python. O valor pode selecionar fonte, arquivo ou comportamento inesperado.

26. **CAN-015 — Instalador usa pacotes pip sem pinning** — `src/core/whisper-installer.js:322-327,430-434`. Dependências mutáveis aumentam o risco de supply-chain.

27. **CAN-016 — Download de whisper.cpp/modelo sem verificação forte de origem/artefato** — `src/core/whisper-installer.js:551-590`, `main.js:969-977`. Conteúdo remoto não verificado pode chegar a componentes executados localmente.

28. **CAN-017 — Processos filhos herdam ambiente completo, incluindo segredos** — `src/core/whisper-installer.js:50-53,324-327,430-438`, `setup.sh:481-490`. Ferramentas e dependências filhas podem receber chaves e tokens do ambiente.

29. **CAN-025 — `setup.sh` usa dependências remotas mutáveis/não fixadas** — `setup.sh:387-490`. O bootstrap pode buscar conteúdo não imutável durante instalação.

30. **CAN-027 — Modelo OpenAI Whisper influencia loader sensível a caminho** — `src/core/whisper-installer.js:803-812`. Variante do risco de seleção/traversal de modelo.

31. **CAN-028 — Configurações Whisper do renderer chegam ao processo filho** — `main.js:1816-1817`, `src/services/speech.service.js:2378-2530`, `scripts/whisper-cpp-worker.py:157-171`. Configuração persistida pode alterar o comando de análise.

### Página pública de downloads

32. **CAN-021 — Metadados de release do GitHub são inseridos no HTML sem escape** — `webapp/script.js:139-145` e caminhos relacionados. Metadado comprometido pode gerar XSS na página pública ou direcionar para download malicioso.

## Registros adicionais observados pelos agents da rodada 3

Os registros abaixo são mantidos individualmente, mesmo quando repetem um candidato canônico. Isso preserva divergências de evidência, pré-condições e foco encontradas por cada análise.

### retry-01

- `CAND-GEMINI-TLS-VERIFY-BYPASS` — `main.js:367-369`, `src/services/llm.service.js:952-963,1410-1423`; bypass global de certificado Gemini.
- `CAND-MOBILE-PLAINTEXT-SYNC` — `src/services/mobile-sync.service.js:26-39,57-80`, `main.js:1659-1677`; OCR, transcripts e respostas em transporte claro.
- `CAND-MOBILE-BEARER-TOKEN-LOG` — `src/services/mobile-sync.service.js:52-80`, `main.js:267-270`, `src/core/logger.js:5-45`; token de sync em URL/log.
- `CAND-CHAT-MARKDOWN-DOM-XSS` — `chat.html:914-946`, `lib/markdown.js:928`, `src/ui/chat-window.js:445-450`; HTML não sanitizado no chat.
- `CAND-LLM-OVERLAY-MARKDOWN-DOM-XSS` — `llm-response.html:605-615,835-883`; HTML não confiável no overlay.
- `CAND-IPC-CAPTURE-SESSION-AUTHZ` — `main.js:573-576,755-763`, `src/services/capture.service.js:20-134`; captura/histórico sem autorização do sender.
- `CAND-IPC-OVERLAY-CONTROL-AUTHZ` — `main.js:685-773`, `preload.js:31-40`; controle de visibilidade, posição e always-on-top sem autorização.
- `CAND-IPC-SETTINGS-SECRETS` — `main.js:884-885,1807-1825`, `preload.js:58-59`; configurações e chaves expostas.
- `CAND-SETTINGS-LOG-CREDENTIALS` — `main.js:2012-2026`, `src/core/logger.js:5-45`; segredos persistidos em logs.
- `CAND-WHISPER-COMMAND-PROCESS-CONTROL` — `main.js:985-986,1873-1886`, `src/services/speech.service.js:2928-2935`; executável selecionável pelo renderer.
- `CAND-WEBAPP-RELEASE-METADATA-DOM-XSS` — `webapp/script.js:139-145,155-181,214-232`; release metadata em HTML.

### retry-02

- `CAND-03-001` — `main.js:367-372`, `src/services/llm.service.js:141-159`; certificado Gemini desabilitado para uploads de tela/transcript.
- `CAND-03-002` — `src/services/mobile-sync.service.js:26-39,76-80,107-125`, `main.js:1660-1677`; endpoint LAN claro com perguntas/respostas.
- `CAND-03-003` — `src/managers/window.manager.js:575-580,913-930`, `README.md:227`; overlay stealth visível em compartilhamento Linux.
- `CAND-03-004` — `lib/markdown.js:925-933`, `chat.html:916,934-945`, `preload.js:55-64`; esquemas arbitrários em markdown do chat.
- `CAND-03-005` — `lib/markdown.js:925-933`, `llm-response.html:605-612,835-883`; esquemas arbitrários no overlay.
- `CAND-03-006` — `src/ui/settings-window.js:145-161`, `main.js:2012-2015`, `src/core/logger.js:16-48`; credenciais em log.
- `CAND-03-007` — `main.js:378-395`, `src/ui/main-window.js:940-959`; permissões globais de microfone/câmera/display.
- `CAND-03-008` — `preload.js:55-59`, `main.js:985-987,1873-1886`, `src/services/speech.service.js:2928-2934,3823-3826`; comando Whisper controlável.
- `CAND-03-009` — `src/managers/window.manager.js:315-320`, `preload.js:42-64`, `main.js:1796-1825`; bridge ampla para todos os renderers.

### retry-03

- `CAND-001` — `chat.html`, `lib/markdown.js`; esquemas executáveis no chat.
- `CAND-002` — `llm-response.html`, `lib/markdown.js`; esquemas executáveis no layout dividido.
- `CAND-003` — `llm-response.html`, `lib/markdown.js`; esquemas executáveis no layout completo.
- `CAND-004` — `llm-response.html`; token de linguagem de código em `innerHTML`.
- `CAND-005` — `main.js:367`, `dist-packaged/.../main.js`; bypass de certificado Gemini.
- `CAND-006` — `main.js:378-395`; permissões media/display sem origem.
- `CAND-007` — `preload.js`, `main.js`, `src/services/capture.service.js`; captura fullscreen sem autorização do sender.
- `CAND-008` — `src/services/mobile-sync.service.js`, `main.js`; sync LAN em claro.
- `CAND-009` — `main.js`, `src/services/mobile-sync.service.js`; token de sync em claro.
- `CAND-010` — `preload.js`, `main.js`; configurações sensíveis para todos os renderers.
- `CAND-011` — `preload.js`, `main.js`, `src/managers/session.manager.js`; histórico OCR/transcript exposto.
- `CAND-012` — `main.js`, `src/core/logger.js`; API keys em log.
- `CAND-013` — `preload.js`, `main.js`, `src/core/whisper-installer.js`; modelo influencia download path.
- `CAND-014` — `preload.js`, `main.js`, `src/services/speech.service.js`; configuração Python chega a processo filho.
- `CAND-015` — `preload.js`, `main.js`, `src/services/speech.service.js`; comando CLI chega a `spawn`.
- `CAND-016` — `src/managers/window.manager.js`; limitação Linux deixa overlay capturável.
- `CAND-017` — `webapp/script.js`; metadata de release em HTML público.

### retry-04

- `CAND-R03-001` — `src/services/mobile-sync.service.js:25-140`, `main.js:1645-1677`; streaming LAN claro de transcripts/respostas.
- `CAND-R03-002` — `main.js:367-373`, `src/services/llm.service.js:952-965,1410-1423`; certificado Gemini desabilitado.
- `CAND-R03-003` — `src/managers/window.manager.js:574-580,849-861,913-935`; proteção/detecção Linux ausente.
- `CAND-R03-004` — `preload.js:109-111`, `main.js:573-576`, `src/services/capture.service.js:32-50,72-88`; qualquer renderer privilegiado chama screenshot desktop.
- `CAND-R03-005` — `preload.js:55-59`, `main.js:884-886,1791-1825`, `src/managers/window.manager.js:315-318`; qualquer renderer lê credenciais.
- `CAND-R03-006` — `main.js:379-396`; handlers globais concedem câmera/display capture.

### retry-05

- `CAN-CAPTURE-DISPLAY-MISMATCH` — `main.js:574-576`, `src/services/capture.service.js:72-100`; fonte de monitor pode não corresponder ao display escolhido.
- `CAN-CAPTURE-AREA-FALLBACK-FULL` — `main.js:574-576`, `src/services/capture.service.js:40-50`; crop inválido cai para imagem completa.
- `CAN-CHAT-MARKDOWN-UNSAFE-URL` — `chat.html:897-920`, `lib/markdown.js:875-928`; URL sem allowlist em renderer privilegiado.
- `CAN-LLM-RESPONSE-MARKDOWN-UNSAFE-URL` — `llm-response.html:605-614,832-883`, `lib/markdown.js:875-928`; URL sem allowlist no overlay.
- `CAN-MOBILE-SYNC-CLEARTEXT` — `src/services/mobile-sync.service.js:22-141`, `main.js:1660-1678`, `mobile-sync.html:39-80`; respostas de tela em HTTP claro.
- `CAN-SETTINGS-SECRET-LOGGING` — `main.js:1791-1828,2012-2015`, `src/core/logger.js:16-49`; credenciais em logs.
- `CAN-WEBAPP-RELEASE-DOM-XSS` — `webapp/script.js:93-106,139-157,210-256`; metadata remota em HTML/URLs.
- `CAN-WHISPER-MODEL-PATH-TRAVERSAL` — `main.js:968-983`, `src/core/whisper-installer.js:572-588,864-870`; nome do modelo influencia caminho de download.
- `CAN-GEMINI-CERT-VALIDATION-BYPASS` — `main.js:354-376`, `src/services/llm.service.js:952-969,1410-1429`; MITM potencial em tráfego sensível.

### retry-06

- `OC-R03-R06-C001` a `C016` — a sexta análise reproduziu 16 registros independentes, incluindo as famílias de markdown inseguro no chat/overlay, bypass Gemini, permissões globais de captura, captura desktop sem autorização, sync LAN claro, token exposto, configurações/credenciais IPC, histórico de sessão, logging de API keys, traversal/modelo Whisper, configuração de processo Whisper, limitação Linux de proteção e metadata de release. As fontes reportadas foram `main.js`, `preload.js`, `chat.html`, `llm-response.html`, `lib/markdown.js`, `src/services/mobile-sync.service.js`, `src/managers/session.manager.js`, `src/core/whisper-installer.js`, `src/services/speech.service.js`, `src/managers/window.manager.js` e `webapp/script.js`.

## Prioridade sugerida para validação

1. Confirmar proteção real do overlay durante compartilhamento em Windows e Linux, inclusive `setContentProtection`, mudança de monitor e gravação por ferramentas comuns.
2. Testar seleção de display/crop com dois monitores de mesma resolução e entradas inválidas.
3. Confirmar alcance LAN do mobile sync, conteúdo de logs, autenticação por token e ausência de TLS.
4. Confirmar que a verificação de certificado Gemini realmente aceita certificados inválidos e observar o impacto sobre screenshot, OCR, transcript e chave.
5. Validar os renderers e IPCs com um payload controlado, sem acessar dados reais, medindo se há execução/navegação ativa e se o sender é autorizado.
6. Validar exposição de chaves/histórico e logging com dados sintéticos.
7. Só depois classificar os achados de Whisper, supply-chain e página pública de downloads, separando riscos diretamente ligados ao compartilhamento de tela dos riscos gerais.

## Artefatos completos

Os artefatos brutos das rodadas permanecem no diretório do scan:

`C:\Users\israe\AppData\Local\Temp\codex-security-scans-smcpNB\OpenCluely\699189a8f77f0a78e36f66e0e477d910a7bc939d_20260716T182359Z_vy0n55n3\artifacts\deep_discovery`

Principais fontes:

- `02_discovery\deduped_candidates.jsonl` — consolidação canônica.
- `05_findings\CAN-001` até `CAN-028` — ledgers dos candidatos canônicos.
- `deep_discovery\round-03\retry-01` até `retry-06` — descobertas independentes da terceira rodada.

## Limites da conclusão

Este documento não afirma que todos os 32 itens canônicos são vulnerabilidades confirmadas. Ele registra o que os agents encontraram, as linhas que sustentam cada hipótese e o que precisa ser reproduzido. A conclusão segura neste estágio é que não existe evidência suficiente para declarar o software protegido contra qualquer visualização ao mostrar a tela; ao contrário, existem vários caminhos plausíveis de exposição que merecem correção e validação imediata.
