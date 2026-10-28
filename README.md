# Tests-of-Afonso
tests that i make for the world
also i want to learn how to code

## Atualização diária do catálogo do YouTube

O workflow do GitHub Actions consulta os uploads públicos do canal uma vez por dia e atualiza `music-data.js`. A chave usada pelo workflow fica em um segredo do GitHub e não é adicionada ao JavaScript do site.

Para configurar:

1. Crie ou selecione uma chave da YouTube Data API v3 no Google Cloud.
2. No repositório, abra **Settings → Secrets and variables → Actions** e crie o segredo `YOUTUBE_API_KEY` com essa chave.
3. Restrinja a chave à YouTube Data API v3 no Google Cloud.
4. Em **Actions**, execute **Update YouTube catalog** uma vez manualmente para validar a configuração.

O workflow também pode ser executado manualmente. Quando o catálogo mudar, ele grava a atualização na branch em que foi executado; o GitHub Pages publica a alteração automaticamente quando estiver configurado para essa branch. A atualização automática no navegador também verifica dados uma vez por dia.

As chaves de YouTube já existentes no site são mantidas para os recursos atuais. Não coloque a nova chave no código-fonte: se uma chave já tiver sido compartilhada, revogue-a e crie outra para o segredo do GitHub.

## Atualização diária do catálogo do Spotify

O site também pode carregar o catálogo público do artista no Spotify usando um fluxo diário do GitHub Actions.

Para configurar:

1. Crie o app no [Spotify for Developers](https://developer.spotify.com/dashboard/).
2. Extraia o `Client ID` e o `Client Secret` e cadastre em **Settings → Secrets and variables → Actions**:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
3. Opcionalmente, defina `SPOTIFY_ARTIST_ID` em **Variables** se quiser usar um artista diferente.
4. Execute **Update Spotify catalog** uma vez manualmente para validar a integração.

Os segredos ficam apenas no GitHub; nunca no código-fonte do site.
