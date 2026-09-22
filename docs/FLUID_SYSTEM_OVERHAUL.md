# Fluid System Overhaul

## Objetivo

Substituir a mistura global da rede hidráulica por um circuito de água orientado, conservativo e diagnosticável.

## Regras de rede

- cada componente hidráulico possui no máximo duas conexões;
- T-junctions são bloqueados pelo PlacementValidator;
- a rede precisa formar um loop fechado;
- deve existir exatamente uma bomba ativa por loop;
- a seta da bomba precisa apontar para o componente downstream;
- rede aberta, ramificada ou com direção inválida recebe vazão zero.

Essa restrição elimina criação artificial de massa em ramificações. Um solver de divisão de vazão pode ser adicionado posteriormente sem mudar a API dos componentes.

## Bomba

A bomba possui direção e define o downstream do circuito. A vazão é calculada pela razão entre hydraulicPower e a resistência total, com limite superior de segurança.

## Transporte de calor

A função antiga circulate(), que aproximava toda a rede de uma temperatura média, foi removida.

Cada volume de controle recebe a entalpia do componente upstream:

dE = massFlow * Cp * (Tin - Tcell) * dt

As atualizações usam o snapshot de temperatura do início do passo. Em um loop fechado a soma das trocas advectivas é zero.

## Trocador

O trocador só atua quando pertence a um circuito CLOSED, existe vazão acima do mínimo e existe uma máquina adjacente. Sem bomba ou com circuito aberto, o resfriamento é zero.

## Radiador

O radiador troca calor com uma região 3x3 de ar, conserva energia, registra Air In/Air Out/fan boost/thermal power e produz convecção natural radial fraca. O airflow forçado aumenta a potência de rejeição.

## Tanque

A massa foi reduzida de 997 kg para 120 kg. Ele continua funcionando como bateria térmica, mas não esconde toda a evolução de temperatura durante missões curtas.

## Diagnóstico

Os componentes hidráulicos expõem networkId, networkStatus, circuitClosed, flowRate, upstreamId, downstreamId, flowVector, inletTemperature, outletTemperature e thermalPower.

## Testes

A suíte cobre circuito aberto, loop fechado, direção da bomba, HX sem fluxo, radiador 3x3, convecção natural, prevenção de T-junction, transporte Machine -> HX -> Pipe -> Radiator -> Air e conservação de energia.