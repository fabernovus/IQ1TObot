# IQ1TO · CQ Spot

Telegram Mini App per i membri di [IQ1TO](https://t.me/IQ1TO), associata a **@IQ1TObot**. Un Cloudflare Worker serve le API e i file statici; D1 conserva gli SPOT. Nessuna dipendenza runtime, framework frontend, mappa, WebSocket o servizio GPS esterno.

## Funzioni

- Verifica server della firma Telegram `initData` (scadenza un’ora) e appartenenza al gruppo con `getChatMember` a ogni richiesta. Riaprire l’app rinnova la sessione.
- Nominativo, banda in metri, frequenza MHz, modo e locator Maidenhead a sei caratteri. GPS Telegram 8+ con fallback browser. Solo il locator lascia il dispositivo.
- Una presenza attiva per utente; lista dei 200 SPOT più recenti; aggiornamento ogni 60 secondi a schermata visibile e pulsante manuale.
- Pubblicazione nel topic CQ Spot; QRT riservato al proprietario e modifica del messaggio originale.
- Idempotenza delle creazioni, cooldown di 60 secondi, query parametrizzate, limite payload, output testuale senza HTML utente.
- Notifiche persistenti con tentativi automatici, cron ogni 5 minuti (massimo 10 invii per esecuzione). SPOT conclusi conservati per 30 giorni; quelli attivi restano fino al QRT.

## Configurazione Cloudflare

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

Una richiesta di lista comporta una richiesta Worker, una verifica Telegram e due letture indicizzate D1. Gli asset sono statici. Il cron esegue 288 volte al giorno; la cancellazione è limitata a 500 righe per esecuzione. Nessuna cronologia infinita, servizio di geocoding o polling a schermata nascosta.

Dopo otto tentativi falliti la notifica passa a `failed`, visibile al proprietario. Dopo aver corretto token/permessi/topic, un amministratore può ripristinare i tentativi da D1 Studio:

```sql
UPDATE spots SET sync_state='pending', sync_attempts=0, sync_after=0
WHERE sync_state='failed';
```

Telegram non offre una chiave di idempotenza per `sendMessage`: se il server accetta il messaggio ma la risposta si perde prima del salvataggio del suo ID, un tentativo successivo può produrre un duplicato. Il vincolo in D1 evita comunque SPOT duplicati nell’app. Un messaggio eliminato manualmente non può essere aggiornato al QRT e verrà segnalato come errore dopo i tentativi. Il database non conserva coordinate precise, token o `initData`; il nominativo salvato nel browser è una preferenza locale. I messaggi Telegram restano nel gruppo anche dopo la pulizia D1.

## Riferimenti

- [Validazione Telegram Mini Apps](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- [Telegram getChatMember](https://core.telegram.org/bots/api#getchatmember)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Band plan IARU Region 1](https://www.iaru-r1.org/on-the-air/band-plans/)
