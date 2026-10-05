# Engenharia Integrada

Aplicação React de gestão de obras conectada ao Supabase, com login por e-mail e senha, banco Postgres e arquivos privados.

## Uso

Selecione a obra e o período no topo. Cadastre obras, arquivos de projetos, serviços de orçamento e atividades. Registre diários, equipes, movimentações de materiais e utilização de equipamentos no acompanhamento. Entradas de materiais e utilização de recursos geram contas a pagar vinculadas. Essas contas podem ser liquidadas no financeiro sem duplicar os custos da execução.

O cronograma aceita dependências e conclusão percentual, com lista e Gantt. Diários podem atualizar uma atividade e receber fotos. Consumos são limitados ao estoque disponível. Contas financeiras independentes aceitam parcelas mensais. O fluxo distingue realizado e projetado. Boletos são apenas demonstrativos, sem validade bancária.

Relatórios usam a obra e o período selecionados, com exportação CSV e impressão/salvamento em PDF pelo navegador. O orçamento de referência da obra é separado do orçamento detalhado dos serviços. O avanço é a média simples das atividades e representa a posição atual; não há histórico de medições de avanço.

## Armazenamento

Os registros ficam nas tabelas `ei_profiles`, `ei_works` e `ei_entries`, com RLS e isolamento por usuário. A escrita por `ei_save_state` é transacional e verifica a revisão para rejeitar alterações baseadas em dados antigos. O perfil, as obras e os registros são carregados por `ei_load_state`.

Fotos e projetos ficam no bucket privado `engenharia-arquivos`, em pastas vinculadas ao ID do usuário. Limite de 2 MB por arquivo e 2 MB no conjunto de fotos selecionadas. URLs assinadas de visualização duram uma hora; downloads fazem uma requisição autenticada nova. Use Atualizar dados da nuvem para renovar visualizações ou carregar alterações feitas em outro dispositivo. Arquivos substituídos são preservados no armazenamento; a limpeza histórica não é automática.

A cópia local anterior, na chave `engenharia-integrada-v1`, é preservada e só é importada ao clicar no botão de importação no primeiro acesso. Cada conta tem seu conjunto privado de obras; não há compartilhamento entre contas ou permissões de equipe nesta etapa. A exportação JSON contém os registros e referências dos arquivos, sem copiar os arquivos privados. Não há integração bancária.

## Configuração do Supabase

Copie `.env.example` para `.env.local` e configure a URL do projeto e a chave **publishable**. Não use chave secret ou service_role no frontend. `.env.local` é ignorado no controle de versão.

As alterações SQL aplicadas no projeto `engenharia-integrada` estão documentadas em `supabase/schema.sql` e `supabase/harden-auto-rls.sql`. São cópias de referência das alterações já aplicadas, e não precisam ser executadas novamente no projeto existente.

Em Authentication → URL Configuration, configure Site URL e Redirect URLs como `http://localhost:8443` no desenvolvimento. Ao publicar o aplicativo, adicione a URL real e atualize Site URL. Mantenha a confirmação de e-mail habilitada. Os fluxos de cadastro e recuperação enviam o retorno para a origem do aplicativo, que precisa constar nessa lista.

## Desenvolvimento

`npm install` instala as dependências. `npm run dev` inicia o Vite em http://localhost:8443. `npm run build` gera a versão de produção. `npx tsc --noEmit` verifica os tipos. `npm test` valida custos, ausência de duplicação e progresso por obra (Node 24).

`node --env-file=.env.local scripts/check-supabase.mjs` verifica que a API está acessível e que chamadas não autenticadas não conseguem ler obras, invocar as funções autenticadas ou assinar arquivos privados.
