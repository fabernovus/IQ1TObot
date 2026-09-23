# Verifica band plan italiano

## Fonti e metodo

Attribuzioni: [pagina PNRF MIMIT](https://www.mimit.gov.it/it/digitale/gestione-spettro-radio/piano-nazionale-ripartizione-frequenze), decreto 31 agosto 2022 e allegati collegati:

- [Tabella A](https://www.mimit.gov.it/images/stories/digitale/02-Tabella_A.pdf)
- [Tabella B](https://www.mimit.gov.it/images/stories/digitale/03-Tabella_B.docx.pdf)
- [Note](https://www.mimit.gov.it/images/stories/digitale/05-Note.pdf)

I PDF sono stati scaricati e il testo estratto anche in ordine di lettura (`pdftotext -raw`): l'estrazione a colonne può disallineare servizi e frequenze. Una sintesi web contraddittoria sui 434–435 MHz è stata risolta controllando la riga del PDF, non accettando il riepilogo della ricerca.

Modi: [IARU R1 HF, edizione effective 1 giugno 2016](https://www.iaru-r1.org/wp-content/uploads/2019/08/hf_r1_bandplan.pdf) e [VHF Handbook 10.02](https://www.iaru-r1.org/wp-content/uploads/2024/11/VHF_Handbook_V10_02.pdf). Sono riferimenti operativi con edizione identificata, non norme MIMIT né una garanzia di aggiornamento automatico.

## Esito per le bande presenti nell'app

| Banda | Attribuzione italiana verificata | Esito |
|---|---|---|
| 2200 m | 135,7–137,8 kHz, nota 8 | Limiti confermati; massimo 1 W EIRP, secondario |
| 630 m | 472–479 kHz, note 15–16 | Limiti confermati; massimo 1 W EIRP, secondario |
| 160 m | 1830–1850 kHz | Confermata esclusione delle estensioni non ordinarie |
| 80 m | 3500–3800 kHz | Limiti confermati, secondario |
| 60 m | 5351,5–5366,5 kHz, nota 32B | Massimo 15 W EIRP; non tutta la riga contenitrice 5275–5450 |
| 40 m | 7000–7200 kHz | Nessun vuoto terrestre; via satellite solo 7000–7100 |
| 30 m | 10100–10150 kHz | Nessun vuoto; secondario |
| 20 m | 14000–14350 kHz | Nessun vuoto terrestre; via satellite solo 14000–14250 |
| 17 m | 18068–18168 kHz | Limiti confermati |
| 15 m | 21000–21450 kHz | Limiti confermati |
| 12 m | 24890–24990 kHz | Limiti confermati |
| 10 m | 28–29,7 MHz | Limiti confermati |
| 6 m | 50–52 MHz, note 56–57 | Secondario, protezione wind profiler |
| 4 m | Nessuna attribuzione ordinaria | Nessuna estensione automatica da sperimentazioni temporanee |
| 2 m | 144–146 MHz, nota 69 | 145,8–146 esclusivamente via satellite, salvo eccezione transitoria delle ripetitrici già autorizzate |
| 70 cm | 430–434 / 435–438 MHz | Vuoto 434–435 confermato, Tabella B pagina stampata 18; ISM/SRD non estendono il servizio radioamatore |
| 23 cm | 1240–1245 / 1270–1298 MHz | Corretta whitelist non continua, Tabella B pagina 21; nota 117: 1267–1270 solo satellite Terra→spazio, secondario, art. 25.11 RR |
| 13 cm | 2300–2450 MHz | Attribuzione terrestre secondaria continua, Tabella B pagine 25–26 |

## Correzioni operative

- Esclusioni nazionali condivise da validazione browser/server e controllo delle cifre. Il controllo salta l'intera lacuna in entrambe le direzioni, anche con passo di 1 Hz.
- I 1267–1270 MHz sono documentati ma non abilitati per SPOT ordinari: manca un modello di collegamento satellitare. Non sono descritti come universalmente vietati.
- CW e digitale HF separati; finestre beacon esclusive non proposte per QSO. La lista CW è di uso preferenziale, non esaustiva di dove il CW è ammesso.
- Sui 60 m fonia limitata alla finestra 5354–5366 kHz; coda 5366–5366,5 riservata ai modi entro 20 Hz nella guida IARU.
- APRS non implica FT8, FT4, RTTY, PSK31 o JS8; righe satellitari, beacon e uscite ripetitori restano consultabili ma non sono suggerimenti generici di TX terrestre.
- Sui 10 m rimosso DV indiscriminato dalle finestre FM con massimo 6 kHz. Sui 6 m inserita la finestra simplex FM/DV 51,410–51,590. Sui 23 cm separati simplex e uscite ripetitori.

## Limiti espliciti

Le schede restano una sintesi, non una tabella esaustiva di ogni modo o frequenza di attività. Una riga senza modi selezionabili è informativa e resta visibile in «Esplora banda». Una mancata corrispondenza non significa divieto normativo. Le finestre digitali non assegnano ogni singola frequenza a FT8/FT4: occorre rispettare larghezza occupata, frequenze di attività, servizi prioritari e canalizzazione.

Gli estremi sono bordi di spettro, non garanzie di trasmissibilità della portante: tutta l'emissione deve rientrare nella porzione consentita. La validazione SPOT verifica frequenza puntuale e lacune, non potenza, larghezza occupata, autorizzazione individuale o coordinamento dei ripetitori. Nessuna autorizzazione temporanea è stata introdotta implicitamente.
