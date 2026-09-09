# IQ1TO · CQ Spot

Telegram Mini App per i membri di [IQ1TO](https://t.me/IQ1TO), associata a **@IQ1TObot**. Un Cloudflare Worker serve le API e i file statici; D1 conserva gli SPOT. Nessuna dipendenza runtime, framework frontend, mappa, WebSocket o servizio GPS esterno.

## Funzioni

- Verifica server della firma Telegram `initData` (scadenza un’ora) e appartenenza al gruppo con `getChatMember` a ogni richiesta. Riaprire l’app rinnova la sessione.
- Due tab: QSO attivi (lista, QRT e direzione antenna) e Genera SPOT (profilo e modulo).
- Nominativo, banda in metri, frequenza MHz, modo e locator Maidenhead a sei caratteri. GPS ad alta precisione con fallback Telegram 8+. Solo il locator lascia il dispositivo.
- Fino a tre SPOT attivi per utente, ciascuno con QRT indipendente; lista dei 200 SPOT più recenti; aggiornamento ogni 60 secondi a schermata visibile e pulsante manuale.
- Pubblicazione nel topic dell’attività (vedi sotto); QRT riservato al proprietario e modifica del messaggio originale.
- Idempotenza delle creazioni, limite di tre presenze verificato atomicamente anche da trigger D1, query parametrizzate, limite payload, testo utente con escape HTML. Non è più necessario attendere un minuto tra i tre SPOT.
- Notifiche persistenti con tentativi automatici, cron ogni 5 minuti (massimo 10 invii per esecuzione). SPOT conclusi conservati per 30 giorni; quelli attivi restano fino al QRT.

## Configurazione Cloudflare

Per gli aggiornamenti via GitHub lasciare il comando di deploy `npm run db:remote && npm run deploy`: applica tutte le migrazioni, comprese `0003_dmr_qsl.sql` e `0004_qsl_delete.sql`, prima del codice. Non ricreare il database: gli SPOT e i profili esistenti vengono conservati.

### Profili, attività e direzione antenna

- Profili D1 associati all’ID Telegram autenticato: nominativo univoco, nome, locator predefinito e ruolo Admin. La migrazione 0002 registra 22699108 come IU1WWY / Antonio / JN35UC / Admin. Il ruolo non è modificabile dalle API del profilo. La registrazione non certifica il possesso della licenza.
- Per chi non è registrato si apre il modulo profilo, senza impedire la pubblicazione. Nominativo e locator sono precompilati e modificabili per il singolo SPOT senza cambiare il profilo.
- Banda a rotella con un solo valore visibile, scorrimento verticale e frecce da tastiera. Frequenza in un unico controllo, con + sopra e − sotto ogni cifra (fino a 1 Hz). Ogni pulsante incrementa/decrementa la posizione decimale corrispondente con riporto; le operazioni fuori banda sono disabilitate.
- Il GPS richiede `enableHighAccuracy: true` e `maximumAge: 0`, scarta fix vecchi oltre 10 secondi e cerca per massimo 25 secondi quello più preciso (si ferma subito entro 30 m). Se necessario prova anche il servizio Telegram, valutando `horizontal_accuracy`. Il locator viene sostituito solo con accuratezza dichiarata entro 100 m, visualizzata nel modulo; altrimenti resta modificabile manualmente. Nessun tracciamento continuo: il watch viene fermato a fine acquisizione. Anche una posizione precisa può cadere vicino al confine di un locator: la qualità effettiva dipende dal dispositivo, dai permessi e dal segnale GPS.
- Attività SOTA/POTA nel topic 12, IAC nel topic 5, CONTEST o nessuna attività nel topic CQ Spot configurato. Nome/riferimento obbligatorio per ogni attività, salvato in maiuscolo come il nominativo. Il topic viene memorizzato alla creazione.
- Messaggi ricchi Telegram tramite `sendRichMessage` con `rich_message.html`: intestazioni, tabella dati SPOT, note e tabella QSL Log. QRT e QSL aggiornano il messaggio originale con `editMessageText` e `rich_message`. Richiede un client Telegram aggiornato per il rendering dei rich message.
- Direzione antenna: azimut sul percorso corto tra i centri dei locator, dal nord geografico. Stesso locator: direzione indeterminata. Il pulsante Telegram apre `https://t.me/IQ1TObot?startapp=bearing_LOCATOR` per calcolare i gradi dal locator di chi legge; richiede la Main Mini App configurata in BotFather.
- La lista esegue quattro letture indicizzate D1 (SPOT, ultimo proprio SPOT, propri SPOT attivi e profilo). Il profilo è conservato fino a modifica/rimozione amministrativa, separato dalla pulizia degli SPOT.

### DMR, note e QSL Log

- Selezionando DMR è obbligatoria la scelta Diretto o BM TG. Diretto richiede banda e frequenza; BM TG richiede un numero talkgroup (1–16777215), senza frequenza. Non viene consultato un catalogo BrandMeister per verificare l’esistenza del TG. Per compatibilità con lo schema originario, gli SPOT BM usano `band=''` e `frequency_hz=0`; questi segnaposto non sono mostrati come frequenze radio. Gli SPOT DMR precedenti diventano Diretti nella migrazione.
- Note facoltative fino a 500 caratteri, pubblicate nella scheda e nel messaggio con escape HTML.
- Ogni altro membro può confermare un QSO per SPOT attivo tramite QSL Log; il proprietario non può auto-confermarsi. Nominativo e locator di partenza sono precompilati e modificabili; data/ora sono inserite esplicitamente in UTC (default: ora attuale). Il server accetta orari dall’apertura dello SPOT fino all’ora attuale, con 60 secondi di tolleranza.
- Il rapporto è quello assegnato dal corrispondente al segnale della stazione che ha pubblicato lo SPOT: RS per i modi diversi da CW, RST per CW. R: 1–5, S/T: 1–9. L’ID Telegram deriva dalla firma, non dal modulo. Il vincolo `(spot_id,user_id)` evita doppie conferme.
- La distanza in km è calcolata sul server tra i centri dei locator con la formula di Haversine; per BM TG è una distanza geografica, non la tratta radio. Il log salva anche l’ora di registrazione sul server e resta associato allo SPOT dopo il QRT.
- Il messaggio mostra gli ultimi 100 QSL e il totale per rientrare nei limiti dei rich message; la Mini App carica il log a pagine di 50 righe. Il pulsante Telegram `startapp=qsl_ID` apre anche il log di uno SPOT concluso. Il log aperto si aggiorna con la lista; se si stanno leggendo pagine precedenti, riaprire il log per tornare agli ultimi QSL.
- Le date del QSL Log sono compatte e in UTC: stesso giorno `HH:MM`, altro giorno nello stesso anno `GG/MM HH:MM`, altro anno `GG/MM/AAAA HH:MM`; i secondi non vengono mostrati. Locator QSL e locator per l’azimut possono essere acquisiti con lo stesso GPS ad alta precisione del modulo SPOT. La direzione antenna non viene proposta per BM TG o per qualsiasi SPOT senza frequenza.
- L’autore di una conferma QSL può eliminarla dalla Mini App; il contatore, il messaggio Telegram e la revisione dello SPOT vengono aggiornati. Il proprietario dello SPOT o altri utenti non possono cancellarla.
- Il nominativo e locator QSL vengono completati server-side dal profilo associato se lasciati vuoti; il default del rapporto è `59` (o `599` per CW).
- La Mini App registra un service worker per mantenere il pannello Locator locale: con asset già caricati, anche senza connessione è possibile calcolare il locator da coordinate manuali o GPS. Le API e la pubblicazione restano disabilitate offline.
- QSL e QRT incrementano una revisione persistente: modifiche durante un invio Telegram non vengono perse. Il cron ritenta entro il normale intervallo di 5 minuti. I log sono eliminati in cascata quando lo SPOT viene rimosso dopo la conservazione di 30 giorni: questo è un registro di presenza, non un archivio permanente del log di stazione.

Richiede Node.js 22.13+ e un account Cloudflare. Su PowerShell usare `npm.cmd` / `npx.cmd` se le policy bloccano gli script `.ps1`.

```powershell
npm.cmd install
npx.cmd wrangler login
npx.cmd wrangler d1 create iq1to-spots
```

Inserire il `database_id` restituito in `wrangler.jsonc`, sostituendo lo UUID segnaposto. Impostare `TELEGRAM_GROUP_ID` all’ID numerico del supergruppo (preferibile) o `@IQ1TO`. Impostare `TELEGRAM_TOPIC_ID` al `message_thread_id` di **CQ Spot**: `0` è un segnaposto e blocca le API per evitare invii nel topic sbagliato.

```powershell
npx.cmd wrangler secret put TELEGRAM_BOT_TOKEN
npm.cmd run db:remote
npm.cmd run build
npm.cmd run deploy
```

Il comando `secret put` chiede il token senza inserirlo nel codice. Il token fornito nella conversazione non è stato salvato nel repository. Se quel token è stato condiviso anche pubblicamente, rigenerarlo con BotFather.

La soluzione usa **Workers Static Assets**, quindi non necessita di un progetto Pages separato. Non attivare la fatturazione a pagamento per il semplice deploy di questo progetto. Limiti e quote dipendono dall’account Cloudflare e dal traffico; il progetto non può garantire di restare entro il free tier a qualunque carico.

## Collegamento Telegram

1. Aggiungere @IQ1TObot al gruppo come **amministratore**: Telegram garantisce `getChatMember` per altri utenti solo in questa condizione. Consentire al bot l’invio di messaggi nel topic CQ Spot.
2. Ricavare l’ID del topic dal link a un messaggio nel topic (formato con ID del thread) oppure dal campo `message_thread_id` di un aggiornamento Bot API. Il solo nome del topic non è sufficiente. Non cambiare webhook o consumare aggiornamenti di un bot già in uso senza verificarne l’integrazione.
3. In **@BotFather → /mybots → @IQ1TObot → Bot Settings → Menu Button**, impostare testo `CQ Spot` e l’URL HTTPS del Worker. Configurare anche la Main Mini App in BotFather per il pulsante nel profilo e il collegamento `https://t.me/IQ1TObot?startapp`.
4. Aprire l’app dal menu/profilo del bot. Un normale link web non fornisce l’identità Telegram; l’interfaccia resterà bloccata. Non è necessario un webhook per le funzioni implementate.
5. Verificare con un membro del gruppo: GPS → pubblicazione → messaggio nel topic → QRT → messaggio aggiornato. Verificare il rifiuto per un account esterno al gruppo.

## Sviluppo e verifiche

```powershell
Copy-Item .dev.vars.example .dev.vars
# Inserire il token in .dev.vars, escluso da Git.
npm.cmd run db:local
npm.cmd run dev
npm.cmd test
npm.cmd run build
```

L’interfaccia locale si apre nel browser, ma le operazioni richiedono autentici dati Telegram; non esiste un bypass di autenticazione. Per la prova completa usare un Worker di staging con bot, gruppo e database dedicati. I test automatici usano SQLite in memoria e Telegram simulato, senza inviare messaggi.

## Scelte e limiti operativi

La lista delle bande è in `public/radio.js`: LF, MF, HF, 6/4/2 m e UHF fino a 0,13 m, con frequenze intere in Hz nel database. Si tratta di una whitelist radioamatoriale Region 1, **non** di una verifica delle autorizzazioni nazionali, della licenza, della potenza, della larghezza di banda o delle sottobande per modo. Le bande non comprese si aggiungono nello stesso file condiviso da server e browser. Nominativo e posizione sono dichiarati dall’utente: l’app verifica il formato, non l’effettivo possesso del nominativo o l’autenticità del GPS.

Una richiesta di lista comporta una richiesta Worker, una verifica Telegram e quattro letture indicizzate D1. La consultazione QSL aggiunge tre letture solo quando il log viene aperto o aggiornato. Gli asset sono statici. Il cron esegue 288 volte al giorno; la cancellazione è limitata a 500 SPOT per esecuzione, con i relativi QSL. Nessuna cronologia infinita, servizio di geocoding o polling a schermata nascosta.

Dopo otto tentativi falliti la notifica passa a `failed`, visibile al proprietario. Dopo aver corretto token/permessi/topic, un amministratore può ripristinare i tentativi da D1 Studio:

```sql
UPDATE spots SET sync_state='pending', sync_attempts=0, sync_after=0
WHERE sync_state='failed';
```

Telegram non offre una chiave di idempotenza per `sendRichMessage`: se il server accetta il messaggio ma la risposta si perde prima del salvataggio del suo ID, un tentativo successivo può produrre un duplicato. Il vincolo in D1 evita comunque SPOT duplicati nell’app. Un messaggio eliminato manualmente non può essere aggiornato al QRT e verrà segnalato come errore dopo i tentativi. Il database non conserva coordinate precise, token o `initData`; i profili conservano nominativo, nome e locator predefinito associati all’ID Telegram. I messaggi Telegram restano nel gruppo anche dopo la pulizia D1.

## Riferimenti

- [Telegram Rich Message Formatting Options](https://core.telegram.org/bots/api#rich-message-formatting-options)

- [Validazione Telegram Mini Apps](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- [Telegram getChatMember](https://core.telegram.org/bots/api#getchatmember)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Band plan IARU Region 1](https://www.iaru-r1.org/on-the-air/band-plans/)
