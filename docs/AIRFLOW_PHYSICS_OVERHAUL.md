# Thermal Lab — Airflow Physics Overhaul

## Modelo

O airflow agora usa um grid MAC 2D incompressível. Velocidades horizontais e verticais ficam nas faces das células; pressão e divergência ficam no centro dos tiles.

Pipeline por tick:

1. sincronizar máscara de sólidos quando a topologia muda;
2. advectar velocidade;
3. aplicar forças de fan e convecção natural;
4. aplicar drag de paredes e turbulência efetiva;
5. calcular divergência;
6. resolver pressão por Jacobi;
7. projetar velocidade para reduzir divergência;
8. impor condições de parede/contorno;
9. exportar velocidade para world.airX/world.airY;
10. transportar calor conservativamente pelas faces.

## Fans

Fan deixou de possuir alcance físico fixo. Cada equipamento possui qFree, pressureShutoff, efficiency e faceArea. O ponto operacional é determinado pela pressão da instalação.

Curva utilizada:

deltaP = deltaPmax * (1 - (Q / Qfree)^2)

Quando o sistema oferece resistência, a pressão cresce e a vazão disponível cai. Em um dead-end a projeção de pressão reduz fortemente a circulação.

## Paredes e corredores

Materiais sólidos bloqueiam a velocidade normal. A proximidade de paredes adiciona drag linear e quadrático, representando perdas que a grade de 0,5 m não resolve diretamente.

Assim, corredores podem preservar o jato e aumentar a velocidade local, mas corredores estreitos, longos, com curvas ou obstruções elevam a perda de carga e podem reduzir a vazão total.

## Transporte térmico

O transporte de calor usa fluxo de massa através das faces e transfere energia entre células em pares. A energia retirada de uma célula é adicionada à vizinha, mantendo conservação no domínio, exceto quando um exhaust transfere energia para o exterior.

## Compatibilidade

world.airX e world.airY continuam disponíveis e são atualizados a partir do MAC grid. Isso mantém compatibilidade com ThermalSystem, radiadores, renderização e missões existentes.

## Diagnóstico

world.airPressure, world.airDivergence e world.airWallProximity ficam disponíveis para Inspector e debug.

Fan expõe:

- qFree
- currentFlow
- pressureShutoff
- currentPressureRise
- availablePressure
- currentVelocity
- operatingPoint
- efficiency

## Visualização

Foi adicionado o modo Pressão:

- azul: pressão relativa negativa;
- cinza: próximo de 0 Pa;
- vermelho: pressão relativa positiva.

O modo Airflow continua mostrando direção e magnitude de world.airX/world.airY, agora calculadas pelo solver.

## Testes

A suíte cobre bloqueio por parede, divergência, decaimento do jato aberto, corredor, corredor estreito, corredor longo, dead-end, curva de 90 graus, transporte térmico, saída aberta e fans em série.

## Limites desta versão

É um solver 2D para gameplay e não CFD industrial. Turbulência é representada por eddy viscosity e drag efetivo; detalhes 3D, camada limite completa e compressibilidade não são resolvidos.