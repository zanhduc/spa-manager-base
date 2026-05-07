# Android Bridge Roadmap

## M0 (da co)

- Local API `/health /printers /print`
- Foreground service + auto start
- LAN ESC/POS (TCP9100)
- Queue + metrics + jobs + logs

## M1 (da co ban)

- USB printer adapter (co ban)
- Bluetooth printer adapter (co ban)
- Retry policy theo error code (offline/busy/timeout)
- Export logs qua endpoint `/logs` + file rotation
- Restore pending jobs sau restart

## M2

- Silent update APK qua MDM
- Multi-tenant config profile theo cua hang
- Push event webhook tu bridge ve backend quan tri

## M3

- Print template renderer local (khong can fetch full URL)
- Worker pool voi priority queue
- Dynamic rate limit theo tai may POS
