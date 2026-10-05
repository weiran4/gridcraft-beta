export function rcFrequencySettings(settings,ibr){
 const mode=settings.fsMode??(Object.hasOwn(settings,'fs')?'custom':'linked');
 const design=ibr?.extensions?.filterDesign;
 return {mode,fs:mode==='custom'?settings.fs:design&&Object.hasOwn(design,'fs')?design.fs:10000};
}
