# Chrome authorization

`pi-chrome` can authorize long-term, but only for the current Pi process. This is intentional.

## Easy path

From the web app:

```bash
npm run serve
```

Open `http://127.0.0.1:8787`, click **Open Chrome auth**, then run the commands below in the Terminal it opens.

CLI fallback:

```bash
npm run auth
```

In the Pi session that opens, run:

```text
/chrome doctor
/chrome authorize indefinite
/chrome background on
```

Keep that Pi session alive. `indefinite` means until you run `/chrome revoke` or that Pi process exits.

## Cron caveat

A cron-created `pi -p` is a new Pi process, so it does not inherit authorization from another terminal. The web app can open the auth session for you, but it does not bypass pi-chrome's explicit confirmation.

For fully unattended daily runs, use one of these:

1. Keep a dedicated long-lived Pi session and ask it to run the daily prompt when needed.
2. Run `./bin/run-daily.sh` manually after authorizing.
3. Build a direct local bridge runner later; skipped for v1 because it bypasses the explicit Pi auth gate.
