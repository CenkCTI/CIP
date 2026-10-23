import {exactIdentifiers} from "./hybrid-retrieval";

/** Conservative search-only aliases, not translation of evidence/claims. */
export function planMultilingualLexicalProbes(question:string):string[]{
 const q=question.slice(0,1500).toLocaleLowerCase("tr-TR");
 const probes:string[]=[];
 const recommend=/öner|tavsiye|tedbir|korun|önlem|savunma|recommendation|measure|protection|mesure/iu.test(q);
 const auth=/kimlik|doğrula|parola|şifre|hesap|authentication|password|credential|authentification/iu.test(q);
 const purpose=/stratejik|amaç|amac|niyet|casusluk|espion|objective|purpose|renseignement/iu.test(q);
 const target=/hedef|kurum|üniversite|kamu|devlet|target|ciblage|gouvernement/iu.test(q);
 const methods=/saldırı|yöntem|teknik|zafiyet|istismar|vuln|exploit|intrusion|attaque/iu.test(q);
 if(recommend&&auth)probes.push("authentification recommandations mots passe mesures");
 else if(recommend)probes.push("recommandations securisation mesures protection");
 if(purpose)probes.push("espionnage renseignement objectifs ciblage intelligence collection");
 if(target)probes.push("ciblage gouvernementales universites organisations institutions");
 if(auth&&!recommend)probes.push("authentification identifiants comptes mots passe");
 if(methods)probes.push("attaques exploitation vulnerabilites intrusion techniques");
 // Identifiers are lexical lookups only. Never replace, uppercase-guess,
 // translate, or use them as proof of an actor/date/attribution.
 const ids=exactIdentifiers(question);
 if(ids.length)probes.unshift(ids.slice(0,3).join(" "));
 return [...new Set(probes)].slice(0,3);
}
