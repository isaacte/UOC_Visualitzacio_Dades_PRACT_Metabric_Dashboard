import {Component, OnDestroy, OnInit, signal} from '@angular/core';
import { DataService } from '../data.service';

import * as d3 from 'd3';
import crossfilter from 'crossfilter2';
import * as dc from 'dc';

@Component({
  selector: 'app-dashboard',
  imports: [],
  templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit, OnDestroy {
  loading = signal(true)

  // Magatzem de les dades
  ndx: any = null

  constructor(private dataService: DataService) { }
  ngOnInit() {
    //Configurem la paleta de colors
    dc.config.defaultColors([...d3.schemeSet2]);

    //Carreguem les dades
    this.dataService.getMetabricData().subscribe({
      next: (data) => {
        // Inicialitzem el motor de filtratge multidimensional
        this.ndx = crossfilter(data);
        this.loading.set(false);

        // Forcem un cicle de renderitzat inicial de dc.js
        // Utilitzem setTimeout per assegurar que els components fills (charts) ja s'hagin inicialitzat i hagin creat els seus gràfics al DOM
        setTimeout(() => dc.renderAll(), 0);
      },
      error: (err) => console.error('Error carregant dades', err)
    });
  }

  ngOnDestroy() {
    // Netegem el registre de gràfics al canviar de vista
    dc.chartRegistry.clear();
  }

  // Funció per a restablir els filtres per complet
  onFiltersReset() {
    // Redibuixa tots els gràfics i actualitza els KPIs registrats al framework dc.js
    dc.redrawAll();
  }

}
