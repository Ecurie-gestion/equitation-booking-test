// Convertit une Date en chaîne AAAA-MM-JJ en utilisant le fuseau horaire LOCAL.
// À ne jamais remplacer par date.toISOString().split('T')[0] : toISOString()
// convertit en UTC, ce qui décale la date d'un jour dès que le fuseau horaire
// local est en avance sur UTC (ex: Belgique) — un cours du mardi se retrouvait
// généré un lundi à cause de ça.
export function toLocalISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Retourne le lundi et le dimanche de la semaine courante + un décalage de
// "offset" semaines (0 = semaine en cours, -1 = semaine précédente, etc.),
// en heure locale (voir toLocalISODate ci-dessus pour la raison).
export function getWeekRange(offset = 0) {
  const now = new Date()
  const jour = now.getDay() // 0 = dimanche, 1 = lundi, ..., 6 = samedi
  const decalageVersLundi = jour === 0 ? -6 : 1 - jour
  const lundi = new Date(now)
  lundi.setDate(now.getDate() + decalageVersLundi + offset * 7)
  lundi.setHours(0, 0, 0, 0)
  const dimanche = new Date(lundi)
  dimanche.setDate(lundi.getDate() + 6)
  return {
    debut: toLocalISODate(lundi),
    fin: toLocalISODate(dimanche),
    lundiDate: lundi,
    dimancheDate: dimanche
  }
}
