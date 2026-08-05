---
name: force-with-lease-silent-fail-labareda
description: On labareda-sistema main, force-with-lease can report Everything up-to-date and silently fail when remote diverged via panel/GitHub push
metadata:
  type: feedback
---

Ao reescrever histórico de `main` no repo labareda-sistema, `git push --force-with-lease` pode retornar `Everything up-to-date` e FALHAR silenciosamente, deixando o objetivo não atingido.

**Why:** O remoto desse repo diverge por fora (pushes vindos do painel GitHub / automação Netlify). Quando isso ocorre entre o fetch e o push, o lease fica desatualizado; um `git fetch` seguinte reconcilia criando um merge commit que REINTRODUZ os commits que se queria eliminar. Aconteceu em 2026-08-05 ao reautorar commits: um merge `bd2cc29` trouxe de volta os commits do `mtorquato1910-cell`.
**How to apply:** Nesse repo, após qualquer force-push que reescreve main, SEMPRE validar o remoto real com `git fetch` + `git ls-remote --heads origin main` + `git log origin/main --format='%an <%ae>' | sort -u`. Se `--force-with-lease` disser "Everything up-to-date" mas o objetivo não foi atingido, resetar local para o topo limpo e usar `git push --force` (autorizado pela regra do projeto para main/app). Antes de resetar, provar equivalência de conteúdo com `git diff <merge> <topo-limpo> --stat` (deve ser vazio). Ver [[netlify-git-contributor-gate]].
