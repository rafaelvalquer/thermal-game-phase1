# Plano Técnico de Desenvolvimento

## Jogo 2D Top-Down baseado em Física Térmica

## 1. Visão do projeto

Desenvolver um jogo 2D top-down em JavaScript utilizando HTML5 Canvas, baseado em simulação térmica.

A física será o elemento central da jogabilidade.

O jogador não altera diretamente a temperatura de uma área. Ele deverá modificar o ambiente utilizando equipamentos, materiais e sistemas térmicos.

O resultado será calculado pela simulação.

Conceitos principais:

- conservação de energia;
- transferência de calor;
- condução;
- convecção;
- capacidade térmica;
- fluxo de ar;
- circulação de água;
- dissipação térmica;
- geração de calor;
- isolamento;
- eficiência energética;
- equilíbrio térmico;
- entropia;
- comportamento emergente.

A arquitetura deverá permitir posteriormente adicionar:

- pressão;
- vapor;
- mudança de fase;
- umidade;
- condensação;
- combustão;
- incêndios;
- radiação térmica;
- radiação solar;
- degradação de materiais;
- circuitos de refrigeração;
- automação industrial;
- falhas mecânicas.

---

# 2. Objetivo da Fase 1

A Fase 1 terá apenas uma missão jogável.

Ela deverá ser suficiente para comprovar que:

1. o calor realmente se propaga pelo mapa;
2. materiais diferentes reagem de forma diferente;
3. fontes de calor acumulam energia;
4. ventiladores transportam calor;
5. água consegue transportar energia térmica;
6. radiadores dissipam calor;
7. isolamento interfere na simulação;
8. equipamentos consomem energia;
9. a temperatura observada é consequência da física;
10. soluções diferentes produzem resultados diferentes.

Não haverá ainda:

- pressão real;
- vapor;
- incêndios;
- umidade;
- condensação;
- fluidos avançados;
- mudança de fase;
- dano estrutural;
- circuito frigorífico completo.

Esses sistemas serão adicionados posteriormente sobre o mesmo núcleo.

---

# 3. Cenário da Fase 1

## Missão: Sala de Máquinas

O jogador recebe uma sala contendo três máquinas industriais.

Cada máquina produz calor continuamente.

Exemplo:

```
┌────────────────────────────────────────────┐
│                                            │
│   M1              M2              M3       │
│  🔥🔥             🔥🔥             🔥🔥      │
│                                            │
│                                            │
│                                            │
│              ÁREA DE TRABALHO              │
│                                            │
│                                            │
│ PORTA                         SAÍDA DE AR   │
└────────────────────────────────────────────┘
```

Parâmetros iniciais:

```
Temperatura externa: 25°C

Máquina 1: 8 kW
Máquina 2: 12 kW
Máquina 3: 15 kW

Temperatura máxima aceitável:
40°C
```

Objetivo:

> manter todas as máquinas abaixo de 40°C durante determinado período.

O jogador receberá inicialmente:

- paredes;
- isolamento;
- ventilador;
- exaustor;
- tubos;
- bomba;
- reservatório de água;
- radiador;
- dissipador metálico;
- sensores térmicos.

---

# 4. Stack

## Linguagem

```
JavaScript ES2023+
```

Sem TypeScript inicialmente.

---

## Frontend

```
HTML5
CSS
JavaScript
Canvas 2D
```

---

## Build

Utilizar:

```
Vite
```

Estrutura simples:

```
npm create vite
```

---

## Rendering

```
HTML5 Canvas 2D
```

Canvas será responsável por:

- mundo;
- tiles;
- equipamentos;
- partículas;
- heatmap;
- overlays;
- debug físico.

A interface lateral pode utilizar HTML/CSS normal.

---

# 5. Arquitetura geral

```
Game
│
├── World
│   ├── TileMap
│   ├── Materials
│   └── Environment
│
├── Simulation
│   ├── ThermalSystem
│   ├── AirflowSystem
│   ├── FluidSystem
│   ├── EnergySystem
│   └── EquipmentSystem
│
├── Entities
│   ├── Machine
│   ├── Fan
│   ├── Exhaust
│   ├── Pipe
│   ├── Pump
│   ├── Tank
│   ├── Radiator
│   └── Sensor
│
├── Player
│   ├── BuildSystem
│   ├── SelectionSystem
│   └── Economy
│
├── Renderer
│   ├── WorldRenderer
│   ├── HeatmapRenderer
│   ├── AirflowRenderer
│   └── DebugRenderer
│
└── UI
    ├── Toolbar
    ├── Inspector
    ├── Graphs
    └── SimulationControls
```

---

# 6. Estrutura de diretórios

```
src/
│
├── main.js
├── game/
│   ├── Game.js
│   ├── GameLoop.js
│   └── GameState.js
│
├── world/
│   ├── World.js
│   ├── Tile.js
│   ├── TileMap.js
│   ├── Material.js
│   └── MaterialRegistry.js
│
├── simulation/
│   ├── Simulation.js
│   ├── ThermalSystem.js
│   ├── AirflowSystem.js
│   ├── FluidSystem.js
│   ├── EnergySystem.js
│   └── SimulationConfig.js
│
├── entities/
│   ├── Entity.js
│   ├── Machine.js
│   ├── Fan.js
│   ├── ExhaustFan.js
│   ├── Pipe.js
│   ├── Pump.js
│   ├── WaterTank.js
│   ├── Radiator.js
│   └── TemperatureSensor.js
│
├── building/
│   ├── BuildSystem.js
│   ├── PlacementValidator.js
│   └── BuildCatalog.js
│
├── rendering/
│   ├── Renderer.js
│   ├── Camera.js
│   ├── TileRenderer.js
│   ├── EntityRenderer.js
│   ├── HeatmapRenderer.js
│   └── AirflowRenderer.js
│
├── input/
│   ├── InputManager.js
│   └── MouseController.js
│
├── ui/
│   ├── UIManager.js
│   ├── Toolbar.js
│   ├── Inspector.js
│   └── MetricsPanel.js
│
└── utils/
    ├── MathUtils.js
    ├── GridUtils.js
    └── Constants.js
```

---

# 7. Mundo baseado em tiles

Mapa inicial:

```
64 × 64 tiles
```

Cada tile representa aproximadamente:

```
0,5 m × 0,5 m
```

Área total aproximada:

```
32 × 32 metros
```

Cada tile possuirá estado físico próprio.

Exemplo:

```
{
    x: 10,
    y: 15,

    materialId: "air",

    temperature: 25,

    thermalEnergy: 25000,

    mass: 0.3,

    heatCapacity: 1005,

    conductivity: 0.025,

    airflowX: 0,
    airflowY: 0,

    heatSource: 0
}
```

---

# 8. Materiais

Criar registro central.

```
const materials = {

    air: {
        density: 1.225,
        heatCapacity: 1005,
        conductivity: 0.025
    },

    water: {
        density: 997,
        heatCapacity: 4186,
        conductivity: 0.6
    },

    concrete: {
        density: 2400,
        heatCapacity: 880,
        conductivity: 1.7
    },

    wood: {
        density: 700,
        heatCapacity: 1700,
        conductivity: 0.12
    },

    steel: {
        density: 7850,
        heatCapacity: 490,
        conductivity: 45
    },

    copper: {
        density: 8960,
        heatCapacity: 385,
        conductivity: 401
    },

    insulation: {
        density: 30,
        heatCapacity: 1400,
        conductivity: 0.03
    }
};
```

Os valores poderão ser balanceados posteriormente.

---

# 9. Energia térmica

Temperatura não será o valor físico primário.

Internamente utilizar:

```
Q = m × c × T
```

Onde:

```
Q = energia térmica
m = massa
c = calor específico
T = temperatura
```

Temperatura:

```
T = Q / (m × c)
```

Isso será fundamental para preservar conservação de energia.

---

# 10. ThermalSystem

Responsável por:

- condução;
- geração térmica;
- troca térmica;
- atualização da temperatura.

Fluxo:

```
source heat
    ↓
thermal energy
    ↓
conduction
    ↓
air convection
    ↓
equipment
    ↓
new temperatures
```

---

# 11. Condução

Cada tile troca energia com:

```
Norte
Sul
Leste
Oeste
```

Na primeira versão não utilizar diagonais.

Transferência aproximada:

```
Q = k × A × ΔT / d × Δt
```

Onde:

```
k  = condutividade
A  = área de contato
ΔT = diferença térmica
d  = distância
Δt = timestep
```

Para dois materiais diferentes:

utilizar média harmônica da condutividade.

```
kEffective =
2 × k1 × k2
────────────
k1 + k2
```

---

# 12. Conservação de energia

Se:

```
Tile A perde 100 J
```

então:

```
Tile B recebe 100 J
```

Nunca:

```
A -= 100
B += 80
```

salvo quando houver explicitamente uma perda para o ambiente externo.

---

# 13. Fontes de calor

Máquinas terão geração térmica em Watts.

Exemplo:

```
machine.heatOutput = 12000;
```

Significa:

```
12.000 Joules / segundo
```

A cada timestep:

```
energyAdded = heatOutput * deltaTime;
```

---

# 14. Massa térmica das máquinas

Máquinas também possuirão:

```
massa
capacidade térmica
temperatura
```

Exemplo:

```
{
    mass: 300,
    heatCapacity: 500,
    temperature: 25,

    heatOutput: 12000
}
```

Portanto elas não aquecerão instantaneamente.

---

# 15. Troca máquina ↔ ambiente

Máquina transfere energia para:

```
ar ao redor
piso
paredes adjacentes
```

Utilizando coeficientes de transferência.

Isso permitirá hotspots naturais.

---

# 16. AirflowSystem

Na Fase 1 não será implementado CFD real.

Cada tile de ar possuirá:

```
airflowX
airflowY
```

Exemplo:

```
velocityX = 0.8 m/s
velocityY = 0.2 m/s
```

---

# 17. Ventiladores

Ventiladores não diminuem temperatura diretamente.

Eles modificam o campo de velocidade.

Exemplo:

```
FAN →

→ → → → →
→ → → → →
 → → → →
```

Propriedades:

```
{
    power: 300,
    airflow: 3.5,
    direction: "east",
    range: 10
}
```

---

# 18. Transporte térmico pelo ar

O fluxo de ar transportará parte da energia térmica.

Modelo simplificado de advecção:

```
tile quente
   ↓
velocidade do ar
   ↓
parte da energia
   ↓
tile seguinte
```

A transferência dependerá de:

```
velocidade
densidade do ar
capacidade térmica
diferença térmica
```

---

# 19. Exaustores

Exaustores serão importantes porque conseguem remover ar quente do ambiente.

Exemplo:

```
SALA

🔥 → → → → [EXAUSTOR]

                ↓

          AMBIENTE EXTERNO
```

A energia não desaparece.

Ela será transferida para um reservatório térmico chamado:

```
OutdoorEnvironment
```

---

# 20. Ambiente externo

Criar:

```
Environment {
    temperature: 25
}
```

Na Fase 1 o ambiente externo será considerado praticamente infinito.

Ou seja:

```
temperatura externa permanece constante
```

Mas toda energia removida será contabilizada para fins de debug.

---

# 21. Sistema de água

Criar circuito térmico simplificado.

Componentes:

```
Pump
Pipe
WaterTank
Radiator
HeatExchanger
```

---

# 22. Pipes

Cada segmento de tubo possuirá:

```
{
    waterTemperature: 25,
    waterMass: 5,

    flowRate: 0,

    maxFlowRate: 5
}
```

---

# 23. Pump

Responsável por determinar vazão.

Na Fase 1:

```
flowRate =
pumpPower / circuitResistance
```

Sem simular pressão.

---

# 24. Resistência hidráulica simplificada

Cada elemento adicionará resistência.

Exemplo:

```
tubo reto:       +1
curva:           +2
radiador:        +5
trocador:        +4
```

Então:

```
Rtotal =
Σ resistência
```

---

# 25. Transporte de calor pela água

Água deverá realmente transportar energia.

```
Q = m × c × ΔT
```

Exemplo:

```
água entra:
25°C

passa pela máquina

sai:
34°C
```

Não haverá valor artificial de:

```
máquina -10°C
```

---

# 26. Radiadores

Radiadores transferem calor:

```
água → ar
```

Eficiência dependerá de:

```
área
temperatura da água
temperatura do ar
fluxo de água
fluxo de ar
```

Um ventilador ao lado do radiador deverá aumentar sua eficiência.

Isso gera uma combinação física interessante:

```
água
+
radiador
+
ventilador
```

---

# 27. Reservatório de água

Tanque atuará como bateria térmica.

Exemplo:

```
1000 litros
25°C
```

Possui enorme capacidade de absorver energia.

Porém:

```
o calor continuará dentro do sistema.
```

Se o jogador apenas armazenar calor no tanque:

```
25°C
↓
30°C
↓
40°C
↓
60°C
```

eventualmente o sistema deixará de funcionar.

---

# 28. Isolamento

Jogador poderá trocar material das paredes.

Exemplo:

```
Concreto
k = 1.7
```

versus:

```
Isolamento
k = 0.03
```

Essa alteração deverá produzir efeito perceptível.

---

# 29. Paredes metálicas

Cobre ou aço poderão ser usados para condução térmica.

Exemplo:

```
Máquina
🔥
│
████████████ cobre
│
Radiador
```

Criando dissipadores improvisados.

---

# 30. Energia elétrica

Cada equipamento terá consumo.

Exemplo:

```
Fan
300 W

Pump
800 W

Exhaust
500 W
```

O jogador terá limite elétrico:

```
10 kW
```

A energia utilizada será exibida continuamente.

---

# 31. Calor gerado pelos equipamentos

Uma porcentagem da energia elétrica utilizada deverá virar calor.

Exemplo:

```
bomba:
800 W elétricos

→ trabalho hidráulico
→ perdas térmicas
```

Pode-se inicialmente usar:

```
20% → calor
```

Isso reforça o conceito de conservação de energia.

---

# 32. Sensores

Ferramenta:

```
Temperature Sensor
```

Pode ser posicionada em qualquer tile.

Exibe:

```
Temperatura atual
Temperatura média
Temperatura máxima
```

---

# 33. Gráficos

Painel lateral deverá mostrar:

```
temperatura máxima
temperatura média
consumo elétrico
energia térmica gerada
energia removida
```

E gráfico temporal:

```
°C
│      /\__
│   __/
│__/
└────────── tempo
```

---

# 34. Visualizações

O jogador poderá alternar entre modos.

### Normal

```
máquinas
paredes
ventiladores
tubos
```

### Thermal View

Heatmap.

```
frio → quente
```

### Airflow View

Setas.

```
→ → ↗
↑   ↓
← ← ↓
```

### Fluid View

Mostrar:

```
fluxo
temperatura da água
```

---

# 35. Heatmap

O Heatmap deverá utilizar uma escala dinâmica.

Exemplo:

```
0°C
↓
20°C
↓
40°C
↓
80°C+
```

Canvas poderá desenhar overlay semitransparente sobre tiles.

---

# 36. Interface

Layout:

```
┌──────────────────────────────────────────────┐
│ MENU                                         │
├────────┬───────────────────────────┬─────────┤
│ BUILD  │                           │ INFO    │
│        │                           │         │
│ Fan    │          MAPA             │ 35°C    │
│ Pump   │                           │ 7.2 kW  │
│ Pipe   │                           │         │
│ Wall   │                           │         │
│ Sensor │                           │         │
│        │                           │         │
├────────┴───────────────────────────┴─────────┤
│ Temperatura █████████                        │
└──────────────────────────────────────────────┘
```

---

# 37. Controles

```
WASD
movimentar câmera

Mouse Wheel
zoom

Botão esquerdo
construir / selecionar

Botão direito
cancelar

Space
pause

1x
velocidade normal

2x
velocidade rápida

4x
simulação acelerada
```

---

# 38. Game Loop

Separar renderização de física.

```
requestAnimationFrame(render);
```

Simulação:

```
20 updates/s
```

Ou:

```
dt = 0.05s
```

---

# 39. Fixed timestep

Exemplo:

```
const FIXED_DT = 1 / 20;

while (accumulator >= FIXED_DT) {

    simulation.update(FIXED_DT);

    accumulator -= FIXED_DT;
}
```

Isso evita resultados diferentes dependendo do FPS.

---

# 40. Ordem da simulação

Cada tick:

```
1. Heat sources
2. Equipment heat
3. Thermal conduction
4. Airflow
5. Air heat transport
6. Water flow
7. Water heat transport
8. Radiators
9. Environment exchange
10. Update temperatures
11. Sensors
12. Statistics
```

---

# 41. Double buffering térmico

Não alterar tiles diretamente enquanto calcula condução.

Utilizar:

```
currentEnergy[]
nextEnergy[]
```

Caso contrário o resultado dependeria da ordem em que os tiles são processados.

---

# 42. Typed Arrays

Como otimização futura, estados físicos poderão utilizar:

```
Float32Array
```

Exemplo:

```
temperature[index]
energy[index]
airX[index]
airY[index]
```

Isso permitirá mapas muito maiores.

---

# 43. Worker de simulação

A arquitetura deverá permitir posteriormente executar:

```
Simulation
      ↓
Web Worker
```

Separando:

```
UI / Canvas

da

simulação física
```

Na Fase 1 pode permanecer na thread principal.

---

# 44. Sistema de construção

Jogador escolhe objeto.

Exemplo:

```
Ventilador
```

Mouse mostra preview:

```
verde = válido
vermelho = inválido
```

Clique constrói.

---

# 45. Inspeção

Clique em qualquer tile:

```
Tile 25,18

Material:
Concrete

Temperature:
36.8°C

Thermal Energy:
2.1 MJ

Airflow:
0.42 m/s
```

Clique em máquina:

```
Machine #2

Temperature:
62°C

Heat Output:
12 kW

Cooling:
7.8 kW

Net Heat:
+4.2 kW
```

---

# 46. Debug físico

Criar modo desenvolvedor:

```
F3
```

Mostrar:

```
Tile index
Energy
Temperature
Conductivity
Heat flux
Air velocity
Water flow
```

Esse modo será fundamental durante desenvolvimento.

---

# 47. Primeira missão

Título:

# Hot Room

Situação:

```
3 máquinas

25°C inicialmente
```

Máquinas ligam após:

```
10 segundos
```

Sem intervenção:

```
25°C
↓
35°C
↓
50°C
↓
70°C
```

Objetivo:

```
Manter todas as máquinas abaixo de 40°C
durante 5 minutos simulados.
```

---

# 48. Ferramentas disponíveis

Jogador recebe:

```
4 ventiladores
2 exaustores
40 tubos
1 bomba
1 tanque
2 radiadores
20 tiles isolantes
10 dissipadores de cobre
5 sensores
```

---

# 49. Diferentes soluções possíveis

O jogo não deverá exigir solução única.

Exemplo 1:

```
ventilação forte
```

Exemplo 2:

```
exaustão direcionada
```

Exemplo 3:

```
water cooling
```

Exemplo 4:

```
isolamento + radiador
```

Exemplo 5:

```
cobre + dissipação
```

Ou combinações.

---

# 50. Falha

Missão falha se:

```
qualquer máquina > 80°C
```

por:

```
30 segundos
```

---

# 51. Vitória

Vitória:

```
T máquinas < 40°C
```

durante:

```
5 minutos simulados
```

mantendo:

```
consumo < limite disponível
```

---

# 52. Mecânica de orçamento

Cada equipamento possui custo.

Exemplo:

```
Ventilador       $100
Exaustor         $300
Bomba            $600
Radiador         $700
Tubulação        $10/tile
Isolamento       $25/tile
Cobre            $80/tile
```

O jogador recebe:

```
$5.000
```

Isso força decisões de engenharia.

---

# 53. Eficiência

Ao terminar:

```
Temperatura máxima
Consumo médio
Energia utilizada
Custo do sistema
Tempo para estabilização
```

O jogo poderá futuramente gerar score, mas inicialmente servirá apenas como telemetria.

---

# 54. Conceito de equilíbrio térmico

Se todas as máquinas forem desligadas:

```
temperaturas devem gradualmente convergir.
```

Exemplo:

```
Sala 50°C
Exterior 25°C

↓

45°C

↓

38°C

↓

31°C

↓

25°C
```

Nunca instantaneamente.

---

# 55. Entropia

Na Fase 1 não haverá variável chamada:

```
entropy
```

O efeito emergirá naturalmente.

Regiões com temperaturas diferentes tenderão ao equilíbrio.

O jogador precisará continuamente gastar energia para preservar gradientes térmicos.

---

# 56. Testes unitários essenciais

Criar testes para física.

### Teste 1

Dois tiles:

```
100°C
0°C
```

Após simulação:

```
temperaturas convergem
```

---

### Teste 2

Sistema fechado:

```
energia antes
≈
energia depois
```

---

### Teste 3

Cobre versus madeira.

Cobre deve atingir equilíbrio muito mais rapidamente.

---

### Teste 4

Água versus ar.

Mesma energia adicionada:

```
ar aquece mais.
```

---

### Teste 5

Ventilador desligado.

Nenhuma alteração artificial de temperatura.

---

### Teste 6

Ventilador ligado.

Calor deve deslocar-se na direção do airflow.

---

### Teste 7

Radiador.

Energia removida da água deve aparecer no ambiente.

---

### Teste 8

Exaustor.

Energia removida da sala deve ser contabilizada no exterior.

---

# 57. Métrica mais importante

Criar um contador global:

```
ENERGY BALANCE
```

Calculado como:

```
energia inicial
+
energia gerada
-
energia enviada ao exterior
-
energia atual
```

Esperado:

```
≈ 0
```

Caso contrário há bug na simulação.

---

# 58. Roadmap físico futuro

A arquitetura da Fase 1 deverá permitir os próximos sistemas.

## Fase 2

Circuito térmico avançado:

```
AC
compressor
refrigerante
evaporador
condensador
COP
```

---

## Fase 3

Fluidos:

```
pressão
vazão
resistência
válvulas
cavitação
```

---

## Fase 4

Mudança de fase:

```
gelo
água
vapor
calor latente
ebulição
```

---

## Fase 5

Umidade:

```
umidade relativa
ponto de orvalho
condensação
evaporação
```

---

## Fase 6

Combustão:

```
ignição
combustível
oxigênio
propagação
fumaça
```

---

## Fase 7

Materiais:

```
temperatura máxima
deformação
derretimento
ruptura
degradação
```

---

## Fase 8

Radiação:

```
radiação térmica
emissividade
superfícies
sol
sombras
```

---

## Fase 9

Automação

Adicionar:

```
sensor
termostato
controller
relay
switch
valve
```

Exemplo:

```
IF T > 40°C
    FAN = 100%

IF T < 30°C
    FAN = OFF
```

---

## Fase 10

Cenários maiores:

```
Casa
Restaurante
Data Center
Fábrica
Usina
Reator
Nave espacial
Base lunar
```

---

# 59. Ordem recomendada de implementação

Implementar nesta ordem:

```
01 Game loop
02 Canvas
03 Camera
04 TileMap
05 Materials
06 Thermal energy
07 Thermal conduction
08 Heat sources
09 Machines
10 Heatmap
11 Build system
12 Fans
13 Airflow
14 Air heat transport
15 Exhaust
16 Pipes
17 Water
18 Pump
19 Tank
20 Radiator
21 Sensors
22 Energy consumption
23 UI
24 Graphs
25 Mission system
26 Win / Fail
27 Debug physics
28 Tests
29 Balancing
30 Optimization
```

---

# 60. Primeiro marco técnico

Antes de criar qualquer jogo, deverá existir uma sandbox:

```
32 × 32 tiles
```

com:

```
tile quente
tile frio
paredes
cobre
madeira
```

E heatmap funcionando.

Objetivo:

confirmar visualmente:

```
condução térmica.
```

---

# 61. Segundo marco

Adicionar:

```
máquina
+
ventilador
```

Objetivo:

visualizar:

```
convecção simplificada.
```

---

# 62. Terceiro marco

Adicionar:

```
água
+
tubulação
+
bomba
+
radiador
```

Objetivo:

demonstrar transporte térmico por fluido.

---

# 63. Quarto marco

Adicionar missão completa:

```
Hot Room
```

Nesse ponto teremos o primeiro protótipo jogável.

---

# 64. Critério para considerar a Fase 1 concluída

A Fase 1 estará concluída quando o jogador conseguir:

1. iniciar uma missão;
2. visualizar máquinas produzindo calor;
3. observar o calor propagando;
4. visualizar heatmap;
5. construir paredes;
6. instalar isolamento;
7. instalar ventiladores;
8. observar movimentação de ar;
9. instalar exaustores;
10. construir circuito de água;
11. instalar bomba;
12. instalar radiador;
13. visualizar a água aquecendo;
14. observar o radiador dissipando calor;
15. utilizar sensores;
16. visualizar consumo de energia;
17. manter a sala dentro dos limites térmicos;
18. perder por superaquecimento;
19. vencer estabilizando o sistema;
20. conseguir resolver o cenário de mais de uma forma.

---

# 65. Resultado esperado da Fase 1

Ao final dessa fase teremos essencialmente:

```
        SIMULAÇÃO TÉRMICA
               │
     ┌─────────┼─────────┐
     │         │         │
 CONDUÇÃO   CONVECÇÃO   ÁGUA
     │         │         │
 materiais   airflow   circuito
     │         │         │
     └─────────┼─────────┘
               │
          EQUIPAMENTOS
               │
               ▼
            JOGADOR
```

O mais importante é que nenhuma ferramenta tenha como comportamento:

```
temperature -= X
```

A regra central do projeto deve ser:

```
O jogador move energia.

A física determina a temperatura.
```

Essa decisão deverá permanecer como princípio técnico de todo o jogo.