
import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

import * as d3 from 'd3';

// Definició de la interfície de dades del pacient
export interface PatientData {
  id: string;
  age: number;
  ageGroup: string;         // Grup d'edat categoritzat
  tumorSize: number;        // Mida del tumor en mm
  tumorSizeGroup: string;   // Classificació T1/T2/T3
  stage: string;            // Estadi del càncer (0-4)
  pam50: string;            // Subtipus molecular
  survivalMonths: number;   // Mesos de supervivència global
  survival5y: boolean;      // Indicador binari: >= 60 mesos
  chemo: boolean;           // Ha rebut quimioteràpia?
  radio: boolean;           // Ha rebut radioteràpia?
  hormone: boolean;         // Ha rebut hormonoteràpia?
  treatmentRegimen: string; // Combinació de tractaments
}

@Injectable({
  providedIn: 'root'
})
export class DataService {

  constructor() { }

  //Carrega les dades reals del tsv
  getMetabricData(): Observable<PatientData[]> {

    // Funció auxiliar per carregar
    const loadFromPath = (path: string) => d3.tsv(path);

    // Carreguem el fitxer i comprovem que sigui vàlid
    const promise = loadFromPath('data/brca_metabric_clinical_data.tsv')
      .then((raw: any[]) => {
        if (!raw || raw.length === 0) {
          throw new Error('El fitxer s\'ha carregat però està buit o té un format incorrecte.');
        }
        return raw.map(d => this.mapPatientData(d));
      });

    return from(promise as Promise<PatientData[]>);
  }

  // Lògica de transformació i neteja de dades
  private mapPatientData(d: any): PatientData {

    // Funció per a netejar els valors numèrics invàlids
    const parseNum = (val: any): number => {
      if (val === null || val === undefined || val === '') return 0;
      const n = parseFloat(val);
      return isFinite(n) ? n : 0;
    };

    // 1. Mapeig de Columnes
    const age = parseNum(d['Age at Diagnosis']);
    const tumorSize = parseNum(d['Tumor Size']);
    const survivalMonths = parseNum(d['Overall Survival (Months)']);

    // Carreguem i normalitzem la resta de columnes
    //Estadi
    let stage = d['Tumor Stage'];
    // Normalització strings buits o nuls
    if (!stage || stage === 'null') stage = 'Unknown';

    // Subtipus PAM50
    const rawPam = d['Pam50 + Claudin-low subtype'] || d.pam50_claudin_low_subtype || d.pam50 || d.subtype || d.PAM50 || 'Normal';
    const pam50 = rawPam.toString()
      .replace('HER2', 'Her2')
      .replace('Luminal A', 'LumA')
      .replace('Luminal B', 'LumB')
      .replace('claudin-low', 'Claudin-low'); // Normalització

    // Tractaments: Convertir YES/NO a booleans
    const parseBool = (val: any) => {
      if (!val) return false;
      return val === 'yes'
    };

    const chemo = parseBool(d['Chemotherapy']);
    const radio = parseBool(d['Radio Therapy']);
    const hormone = parseBool(d['Hormone Therapy']);

    // 2. Càlcul de variables extra
    const ageGroup = this.getAgeGroup(age);
    const tumorSizeGroup = this.getTumorSizeGroup(tumorSize);
    const survival5y = survivalMonths >= 60;

    // 3. Tractaments (normalitzats)
    let regimen = 'None';
    const treatments = [];
    if (chemo) treatments.push('Chemo');
    if (radio) treatments.push('Radio');
    if (hormone) treatments.push('Hormone');

    if (treatments.length === 0) regimen = 'No Adjuvant';
    else if (treatments.length === 1) regimen = treatments[0] + ' Only';
    else if (treatments.length === 3) regimen = 'Triple Therapy';
    else if (chemo && radio) regimen = 'Chemo+Radio';
    else if (chemo && hormone) regimen = 'Chemo+Hormone';
    else if (radio && hormone) regimen = 'Radio+Hormone';
    else regimen = 'Mixed';

    return {
      id: d['Patient ID'] || d.patient_id || d.id || d.PATIENT_ID || Math.random().toString(),
      age,
      ageGroup,
      tumorSize,
      tumorSizeGroup,
      stage,
      pam50,
      survivalMonths,
      survival5y,
      chemo,
      radio,
      hormone,
      treatmentRegimen: regimen
    };
  }

  // Funció per agrupar edats
  private getAgeGroup(age: number): string {
    if (age < 40) return '<40';
    if (age < 50) return '40-49';
    if (age < 60) return '50-59';
    if (age < 70) return '60-69';
    return '70+';
  }

  // Funció per agrupar mides de tumor
  private getTumorSizeGroup(size: number): string {
    if (size <= 20) return 'T1 (<=20mm)';
    if (size <= 50) return 'T2 (20-50mm)';
    return 'T3 (>50mm)';
  }
}
