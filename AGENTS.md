<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- UI strings live in src/lib/i18n.tsx (ar/en dict); add both languages for every new string — app is bilingual RTL/LTR.
- Crypto payment approval runs through the review_payment SQL function so only admins can activate investments.
