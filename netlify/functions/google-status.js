const { createClient } = require('@supabase/supabase-js')

// Indique si un compte Google est connecté (présence d'un jeton), sans
// jamais renvoyer le jeton lui-même. Nécessite une session admin valide :
// depuis l'activation de la sécurité (RLS), la table google_tokens n'est
// plus lisible directement par le site, y compris depuis l'espace moniteur
// — seule cette fonction technique (avec la clé service) peut la consulter.
exports.handler = async (event) => {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!accessToken) {
    return { statusCode: 401, body: JSON.stringify({ connected: false }) }
  }
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  if (error || !user) {
    return { statusCode: 401, body: JSON.stringify({ connected: false }) }
  }

  const { data } = await supabase
    .from('google_tokens')
    .select('id')
    .eq('id', 'moniteur')
    .maybeSingle()

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connected: !!data })
  }
}
