# HidroBot API

## Comprobaciones antes de commit

```bash
npm run check
```

Ejecuta `node --check` en todo `src/` y la suite de tests (`--test-concurrency=1`).

Arranque rápido (requiere `DATABASE_URL` accesible):

```bash
node scripts/smoke-boot.mjs
```

## Hook de git (recomendado, una vez por clon)

Desde la raíz del repo:

```bash
git config core.hooksPath .githooks
```

En Unix, si el hook no corre: `chmod +x .githooks/pre-commit`.