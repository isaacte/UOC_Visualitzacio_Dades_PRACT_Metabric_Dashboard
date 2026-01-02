import {Component, input, OnInit, OnDestroy, signal, Input} from '@angular/core';
import {DecimalPipe, NgClass} from '@angular/common';

@Component({
  selector: 'app-kpi-board',
  imports: [DecimalPipe, NgClass],
  templateUrl: './kpi-board.html',
})
export class KpiBoard implements OnInit {
  //Dataset d'entrada
  @Input({required: true}) ndx!: any;

  //Senyals per a actualitzar els KPI quan sigui necessari
  totalPatients = signal(0);
  filteredPatients = signal(0);
  survivalRate = signal(0);
  avgAge = signal(0);
  avgTumorSize = signal(0);
  chemoRate = signal(0);

  ngOnInit() {
    this.calculate();

    // Listener del crossfilter
    // .onChange s'executa automàticament cada vegada que un gràfic o filtre modifica la selecció de dades
    this.ndx.onChange(() => {
      this.calculate();
    });
  }


  // Recalcula tots els KPIs basant-se en les dades filtrades actuals

  public calculate() {
    // Obtenim l'array de pacients que compleixen els filtres actius
    const allData = this.ndx.allFiltered();

    const count = allData.length;
    const survived = allData.filter((d: any) => d.survival5y).length;
    const rate = count > 0 ? (survived / count) * 100 : 0;

    this.totalPatients.set(this.ndx.size()); // Total absolut
    this.filteredPatients.set(count); // Total actual
    this.survivalRate.set(rate);

    // Càlculs de mitjanes i taxes addicionals
    if (count > 0) {
      // Càlcul per Edat (filtrant valors invàlids o 0)
      const validAgeData = allData.filter((d: any) => typeof d.age === 'number' && !isNaN(d.age) && d.age > 0);
      const totalAge = validAgeData.reduce((sum: number, d: any) => sum + d.age, 0);
      this.avgAge.set(validAgeData.length > 0 ? totalAge / validAgeData.length : 0);

      // Càlcul per Mida Tumor (filtrant valors invàlids)
      const validSizeData = allData.filter((d: any) => typeof d.tumorSize === 'number' && !isNaN(d.tumorSize));
      const totalSize = validSizeData.reduce((sum: number, d: any) => sum + d.tumorSize, 0);
      this.avgTumorSize.set(validSizeData.length > 0 ? totalSize / validSizeData.length : 0);

      const chemoCount = allData.filter((d: any) => d.chemo).length;
      this.chemoRate.set((chemoCount / count) * 100);
    } else {
      // Valors a 0 si no hi ha dades seleccionades
      this.avgAge.set(0);
      this.avgTumorSize.set(0);
      this.chemoRate.set(0);
    }
  }
}
