# Contributing to nextjs-waitlist-double-opt-in

Thanks for taking the time to contribute. Bug reports, ideas, documentation fixes and code are all welcome. This guide takes you from cloning the repo to an opened pull request.

## Ways to help

- Report a bug or suggest a feature by opening an issue. Say what you expected, what happened, and the steps to reproduce it.
- Improve the README or the docs.
- Pick up an open issue. Issues labelled `good first issue` are a good place to start.

## Picking up an issue

1. Browse the open issues and choose one.
2. Comment on it to say you'd like to work on it, and wait for a maintainer to reply before you start.
3. Work on one issue at a time.
4. If you can't finish, say so in the issue so someone else can take it.

If you want to work on something that has no issue yet, open one first and describe your idea, so you don't spend time on a change that doesn't fit.

## Set up

You need Node.js 20 or newer.

```bash
git clone https://github.com/<your-username>/nextjs-waitlist-double-opt-in.git && cd nextjs-waitlist-double-opt-in
npm install
cp .env.example .env          # set MAILTRAP_API_TOKEN and MAILTRAP_FROM_EMAIL
npm run templates:sync        # creates the 4 email templates and prints their IDs for .env
```

**The tests need no credentials**, because the email layer is replaced by a fake.

## Run it

```bash
npm run dev
```

Open http://localhost:3000. The SQLite database is created at `./data/waitlist.db` on the first request. To try the webhook locally without a tunnel, run `npm run webhook:test -- someone@example.com unsubscribe`.

## Tests and checks

These are the same checks that CI runs:

```bash
npm run format:check   # run `npm run format` to fix formatting
npm run lint
npm run typecheck
npm test
npm run build
npm run audit:deps     # known vulnerabilities in production dependencies
```

Please add or update tests for the behavior you change, and run all the checks above before you open a pull request.

## Making your change

1. Fork the repository and create a branch from `main`. Use a short name that says what it does, such as `fix/expired-code-message`, `feature/dark-theme` or `docs/readme-typo`.
2. Keep each pull request focused on one change. Don't mix refactoring or formatting changes into it.
3. Write commit messages as a short, imperative summary of what changed (for example `Fix wrong time in reminder email`), and add a few lines of explanation if the reason isn't obvious.
4. Push your branch and open a pull request against `main`.

A good pull request description says:

- what the change does and why it is needed;
- how you tested it;
- which issue it closes, written as `Closes #123`;
- screenshots for any change to the user interface.

## Project layout

- `src/app/`: the pages and API routes.
- `src/lib/`: signup, confirmation, referrals, the launch email, webhooks and the database.
- `emails/`: the email template HTML and text.
- `scripts/`: `launch`, `templates:sync` and `webhook:test`.
- `drizzle/`: database migrations. Run `npm run db:generate` after you change the schema in `src/lib/db/schema.ts`.
- `tests/`: the test suite.

## Keep secrets out

Never put API tokens, `.env` contents or real customer data in an issue, a pull request or a commit. `.env` is git-ignored, and the example file only contains placeholders.

## License

By contributing, you agree that your contributions are licensed under the project's [MIT license](LICENSE).
