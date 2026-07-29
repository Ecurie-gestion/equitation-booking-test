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
