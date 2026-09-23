# Thermal Lab — Fase 1

Protótipo 2D top-down em JavaScript + HTML5 Canvas focado em física térmica. A regra central é simples: **o jogador move energia; a física determina a temperatura**.

## Rodar

```bash
npm install
npm run dev
```

Depois abra o endereço informado pelo Vite (normalmente `http://localhost:5173`).

## Testar e gerar build

```bash
npm test
npm run build
```

## Missão Hot Room

- Três máquinas ligam após 10 segundos e geram 8 kW, 12 kW e 15 kW de calor.
- Mantenha todas abaixo de 40°C por 5 minutos simulados.
- Limite elétrico: 10 kW.
- Falha se uma máquina permanecer acima de 80°C por 30 segundos.

## Controles

- `WASD`: mover câmera
- roda do mouse: zoom
- clique esquerdo: construir / selecionar
- clique direito ou `Esc`: cancelar ferramenta / voltar à inspeção
- `R`: girar ventilador/exaustor
- `Space`: pausa
- `1`, `2`, `4`: velocidade da simulação
- `F3`: debug físico no tile sob o mouse

## Sistemas implementados

- mapa 64×64 com tiles de 0,5 m;
- materiais: ar, água, concreto, madeira, aço, cobre e isolamento;
- energia térmica, massa, calor específico e condutividade;
- condução com conservação de energia e média harmônica da condutividade;
- máquinas com massa térmica e geração de calor em watts;
- airflow simplificado e conservativo;
- ventiladores e exaustores;
- ambiente externo como reservatório térmico;
- rede simplificada de água com tubo, bomba, tanque, trocador e radiador;
- radiador influenciado pelo airflow;
- consumo elétrico e calor residual dos equipamentos;
- sensores de temperatura;
- orçamento e estoque de equipamentos;
- modos Normal, Térmico, Airflow e Fluido;
- inspector, gráfico de temperatura e Energy Balance;
- vitória/falha da missão;
- testes automatizados de física.

## Observação sobre o modelo físico

A Fase 1 usa aproximações discretas estáveis voltadas a gameplay. Não é CFD de engenharia. Transferências internas são feitas de forma conservativa; saídas/entradas externas são contabilizadas separadamente no Energy Balance.


## Campanha — Fases 1 a 6

O projeto agora possui campanha data-driven com progressão persistida em localStorage:

1. Hot Room — fundamentos térmicos
2. Ventilation Corridor — airflow e corredores
3. Office Complex — múltiplas salas e limites por zona
4. Server Vault — hot/cold aisle, racks e pico de carga
5. Thermal Factory — forno, isolamento e redes industriais
6. Critical Facility — infraestrutura bloqueada e eventos operacionais

As fases ficam em src/campaign/levels/ e os layouts em src/campaign/maps/. Objetivos, falhas e eventos são configurados por dados; o motor físico continua responsável pelas temperaturas.


## Circuito hidráulico

O sistema de fluidos usa loops simples e orientados. Para gerar vazão, a rede precisa formar um circuito fechado, possuir exatamente uma bomba ativa e a seta da bomba deve apontar para o primeiro componente downstream. Ramificações em T não são permitidas nesta versão. O trocador só remove calor da máquina quando existe vazão válida; o radiador rejeita calor para uma área 3x3 e seu desempenho aumenta com airflow.


## Airflow Physics

O airflow usa agora um solver 2D incompressível em MAC grid com pressão, conservação de massa, wall drag, curva pressão-vazão das fans e advecção térmica conservativa. Corredores alteram o escoamento pela própria geometria: podem concentrar o jato, mas comprimento, estreitamento, curvas, obstáculos e dead-ends adicionam resistência. O jogo possui também um modo visual de Pressão e telemetria de operating point das fans.


## Visual Physics

O renderer suporta Airflow em Vetores, Streamlines RK2 e Partículas. Streamlines consomem diretamente o campo físico `world.airX/world.airY`, usam seeds adaptativos e cache de 250 ms. Zonas quentes recebem Heat Haze via offscreen Canvas e slice displacement, com intensidade baseada em ΔT e inclinação influenciada pelo airflow. F3 inclui telemetria de geração das linhas e custo do haze.
