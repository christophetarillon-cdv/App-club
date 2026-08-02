export interface DanceStyle {
  id: string;
  name: string;
  color: string;
  // Absent ou true : proposé dans les filtres audios/vidéos. false : réservé
  // au planning des cours (ex. style générique non pertinent en médiathèque).
  usedInMedia?: boolean;
}
