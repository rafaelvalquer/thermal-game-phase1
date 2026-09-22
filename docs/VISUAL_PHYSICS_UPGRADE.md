# Thermal Lab — Visual Physics Upgrade

Implementação do plano de Airflow Streamlines + Heat Haze.

## Streamlines

A camada de airflow agora suporta três modos: vectors, streamlines e particles. Streamlines é o padrão.

Arquitetura:
- StreamlineGenerator: interpolação bilinear e integração RK2/midpoint;
- StreamlineSeeder: seeds de fans, exhausts, radiadores quentes e grid adaptativo;
- StreamlineCache: atualização nominal a 4 Hz com assinatura do campo;
- StreamlineRenderer: curvas suavizadas, dash animado por velocidade e indicação de loops;
- AirflowParticleRenderer: partículas seguindo o mesmo campo físico.

As trajetórias param em baixa velocidade, borda do mapa, parede, limite de pontos ou loop detectado. O renderer nunca cria uma direção independente da simulação: ele consome world.airX/world.airY.

## Heat Haze

O mundo é renderizado primeiro em um canvas offscreen. A camada HeatHazeRenderer copia a cena para o canvas principal e reaplica slices deslocados apenas nas regiões quentes.

Fontes:
- máquinas;
- furnaces;
- radiadores;
- hot air regional amostrado em blocos.

A intensidade usa principalmente ΔT entre fonte e ar local. O campo de airflow inclina o vetor visual do haze, combinando buoyancy visual ascendente com velocidade do ar.

A UI, seleção, labels e overlays de Pressure/Airflow/Fluid são desenhados depois da distorção e permanecem legíveis.

## Qualidade e performance

Configuração central em VisualSettings.js:
- streamlines;
- streamlineDensity;
- airflowMode;
- heatHaze;
- heatHazeQuality;
- maxHazeRegions.

Streamlines usam cache de 250 ms. Heat haze limita regiões ativas e faz viewport culling. F3 mostra quantidade de linhas/pontos, tempo de geração, idade do cache, regiões de haze e custo de render.

## Testes

A suíte cobre:
- streamline reta;
- parede sólida;
- curva de 90°;
- dead air;
- recirculação;
- seed de fan;
- threshold de haze;
- intensidade por ΔT;
- influência lateral do airflow;
- viewport culling;
- redução por modo visual.
