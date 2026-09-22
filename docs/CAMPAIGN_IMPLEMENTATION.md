# Thermal Lab — Campanha Fases 1 a 6

## Arquitetura implementada

A campanha é orientada a dados. Game não desenha mais a Hot Room diretamente.

- CampaignManager: progresso e melhores resultados em localStorage.
- UnlockSystem: desbloqueio sequencial.
- LevelManager: transforma LevelDefinition em World.
- MapBuilder: constrói salas, corredores, materiais e aberturas.
- ObjectiveSystem: objetivos de máquina, zona, potência e fluido.
- FailureSystem: superaquecimento por equipamento ou zona.
- MissionEventSystem: picos de carga, ativação de processos e temperatura externa.
- MissionRuntime: estado da missão e tempo contínuo de estabilidade.
- ZoneUtils: métricas térmicas por área.

## Fases

1. Hot Room — fundamentos.
2. Ventilation Corridor — airflow e geometria.
3. Office Complex — múltiplas salas e cargas passivas.
4. Server Vault — racks direcionais, hot/cold aisle, minimap e pico de carga.
5. Thermal Factory — forno de alta temperatura, motores, isolamento e água.
6. Critical Facility — infraestrutura bloqueada e eventos em 180 s, 300 s e 420 s.

## Entidades novas

- ServerRack: máquina com entrada e saída de ar direcionais.
- Furnace: grande massa térmica operando em alta temperatura.
- PassiveHeatSource: pessoas, computadores e outras cargas menores.

## Regra física

Nenhuma fase reduz temperatura diretamente. Eventos podem alterar carga térmica, ativar equipamentos ou mudar a temperatura externa. Condução, airflow e fluido continuam determinando as temperaturas resultantes.

## Extensão

Para criar uma nova fase, adicione um mapa em src/campaign/maps/, uma definição em src/campaign/levels/ e registre-a em levels/index.js. Nenhuma alteração no motor é necessária para layouts e objetivos já suportados.
