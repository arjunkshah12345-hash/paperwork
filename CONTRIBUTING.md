# Contributing to Paperwork

Paperwork is an MIT-licensed, local-first PDF toolkit. Contributions that make everyday PDF tasks simpler are welcome.

## Development

Use Node.js 22.13 or newer:

```sh
npm ci
npm run dev
```

Before submitting changes:

```sh
npm test
npm run build
```

Keep changes focused. Add operation tests in `src/lib/pdf.test.ts` when changing PDF behavior. Check desktop and narrow mobile layouts when changing the UI, including dark mode and keyboard navigation.

## Privacy

Document processing must remain in the browser. Do not add document uploads, analytics, external font requests, or persistent document storage. Avoid including real or sensitive documents in tests or issues; generate minimal fixtures instead.

## Pull requests

Explain the problem, your changes, and how you tested them. Include screenshots for visual changes. Describe limitations honestly rather than advertising unsupported conversions or compression guarantees.

By contributing, you agree that your contributions are licensed under this project's MIT license.
