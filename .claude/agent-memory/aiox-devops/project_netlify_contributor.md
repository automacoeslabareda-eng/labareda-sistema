---
name: netlify-git-contributor-gate
description: Netlify free plan blocks deploy on unrecognized Git contributors — repo must have single recognized author in history
metadata:
  type: project
---

Netlify (plano grátis) do repo `automacoeslabareda-eng/labareda-sistema` bloqueia deploy com "unrecognized Git contributor" quando aparece um 2º autor no histórico.

Contribuidor RECONHECIDO (único aceito): `adavio-tittoni <automacoessetimoandar@gmail.com>`.
Autor problemático que já apareceu: `mtorquato1910-cell <mtorquato1910@gmail.com>` (é o git user local da máquina do Mathe).

**Why:** Plano grátis do Netlify limita contribuidores; qualquer commit de um 2º email trava o build.
**How to apply:** Antes de qualquer push nesse repo, verificar `git log --format='%an <%ae>' | sort -u` — só pode haver `adavio-tittoni`. Se aparecer outro autor, reautorar (`git config user.email automacoessetimoandar@gmail.com` + rebase `--exec "git commit --amend --no-edit --reset-author"`) antes de push. O `git config user.email` local da máquina NÃO é o autor reconhecido, então é fácil reintroduzir o problema.
