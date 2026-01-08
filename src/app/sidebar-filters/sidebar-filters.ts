
import { ChangeDetectionStrategy, Component, input, OnDestroy, OnInit, output } from '@angular/core';

import * as d3 from 'd3';
import * as dc from 'dc';

@Component({
  selector: 'app-sidebar-filters',
  templateUrl: './sidebar-filters.html',
  styleUrls: ['./sidebar-filters.css'],
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 4px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarFiltersComponent implements OnInit, OnDestroy {
  ndx = input.required<any>(); // Instància de Crossfilter injectada
  reset = output<void>(); // Esdeveniment per notificar al pare

  private filterCharts: any = {};
  private dims: any[] = [];

  ngOnInit() {
    this.initFilters();
  }

  ngOnDestroy() {
    // Dispose de les dimensions per evitar fuites de memòria en Crossfilter
    this.dims.forEach(d => d.dispose());
  }

  private initFilters() {
    // Ordre personalitzat per seguir el dels gràfics
    const stageOrder = ['0', '1', '2', '3', '4', 'Unknown', 'NA'];
    const pam50Order = ['LumA', 'LumB', 'Her2', 'Basal', 'Normal', 'Claudin-low', 'NC', 'NA'];

    // Creem les dimensions per filtrar
    const chemoDim = this.ndx().dimension((d: any) => d.chemo ? 'Sí' : 'No');
    const radioDim = this.ndx().dimension((d: any) => d.radio ? 'Sí' : 'No');
    const hormoneDim = this.ndx().dimension((d: any) => d.hormone ? 'Sí' : 'No');

    const stageFilterDim = this.ndx().dimension((d: any) => d.stage);
    const survivalFilterDim = this.ndx().dimension((d: any) => d.survival5y ? 'Supervivents (>5a)' : 'Difunts (<5a)');
    const pam50FilterDim = this.ndx().dimension((d: any) => d.pam50);

    const ageLinearDim = this.ndx().dimension((d: any) => d.age);
    const tumorSizeLinearDim = this.ndx().dimension((d: any) => d.tumorSize);

    this.dims.push(chemoDim, radioDim, hormoneDim, stageFilterDim, survivalFilterDim, pam50FilterDim, ageLinearDim, tumorSizeLinearDim);

    // Creem els grups
    const chemoGroup = chemoDim.group();
    const radioGroup = radioDim.group();
    const hormoneGroup = hormoneDim.group();
    const stageFilterGroup = stageFilterDim.group();
    const survivalFilterGroup = survivalFilterDim.group();
    const pam50FilterGroup = pam50FilterDim.group();

    const ageLinearGroup = ageLinearDim.group((d: number) => Math.floor(d));
    const tumorSizeLinearGroup = tumorSizeLinearDim.group((d: number) => Math.floor(d / 5) * 5);

    // Funció per crear tots els grups, ni que estiguin buits amb corssfilter per mantenir la consistència
    const createStableGroup = (group: any, keyOrder: string[]) => {
      return {
        all: (): { key: string; value: number }[] => {
          const itemMap = new Map<string, number>(group.all().map((d: { key: string; value: number; }) => [d.key, d.value]));
          const result = keyOrder.map(key => ({ key: key, value: itemMap.get(key) || 0 }));
          return result;
        }
      };
    };

    const stablePam50Group = createStableGroup(pam50FilterGroup, pam50Order);
    const stableStageGroup = createStableGroup(stageFilterGroup, stageOrder);

    // Creem els filtres
    this.filterCharts.outcome = this.setupCboxMenu('#filter-outcome', survivalFilterDim, survivalFilterGroup);
    this.filterCharts.stage = this.setupCboxMenu('#filter-stage', stageFilterDim, stableStageGroup);
    this.filterCharts.pam50 = this.setupCboxMenu('#filter-pam50', pam50FilterDim, stablePam50Group);
    this.filterCharts.chemo = this.setupCboxMenu('#filter-chemo', chemoDim, chemoGroup);
    this.filterCharts.radio = this.setupCboxMenu('#filter-radio', radioDim, radioGroup);
    this.filterCharts.hormone = this.setupCboxMenu('#filter-hormone', hormoneDim, hormoneGroup);

    this.filterCharts.age = this.setupRangeChart('#filter-age', ageLinearDim, ageLinearGroup, [20, 100]);
    this.filterCharts.tumorSize = this.setupRangeChart('#filter-tumor-size', tumorSizeLinearDim, tumorSizeLinearGroup, [0, 180]);

    // Funció per ordenar els elements
    const forceOrderAndHide = (chart: any, order: string[]) => {
      // Esperem per a que el DOM hagi carregat
      setTimeout(() => {
        const ul = chart.select('ul');
        if (ul.empty()) return;

        // Diccionari per accedir ràpidament als elements
        const items = new Map<string, HTMLElement>();
        chart.selectAll('li.dc-cbox-item').each(function(this: any, d: { key: string }) {
          items.set(d.key, this as HTMLElement);
        });

        // Afegim els elements amb l'ordre desitjat
        order.forEach(key => {
          if (items.has(key)) {
            ul.node().appendChild(items.get(key)!);
          }
        });

        // Ocultem els elements que tinguin un recompte de 0 un cop han estat ordenats
        chart.selectAll('li.dc-cbox-item').style('display', (d: { value: number }) => d.value > 0 ? '' : 'none');

      }, 0);

    };

    // Apliquem la funció als filtres que ho necessiten
    this.filterCharts.stage.on('postRender', (chart: any) => forceOrderAndHide(chart, stageOrder));
    this.filterCharts.stage.on('postRedraw', (chart: any) => forceOrderAndHide(chart, stageOrder));
    this.filterCharts.pam50.on('postRender', (chart: any) => forceOrderAndHide(chart, pam50Order));
    this.filterCharts.pam50.on('postRedraw', (chart: any) => forceOrderAndHide(chart, pam50Order));

    // Inicialment marquem tots els checkboxs per defecte
    const setAllChecked = (chart: any, group: any) => {
      const allKeys = group.all().map((d: any) => d.key);
      chart.replaceFilter([allKeys]);
    };

    setAllChecked(this.filterCharts.outcome, survivalFilterGroup);
    setAllChecked(this.filterCharts.stage, stageFilterGroup);
    setAllChecked(this.filterCharts.pam50, pam50FilterGroup);
    setAllChecked(this.filterCharts.chemo, chemoGroup);
    setAllChecked(this.filterCharts.radio, radioGroup);
    setAllChecked(this.filterCharts.hormone, hormoneGroup);
  }

  // Helper per crear menús de checkboxes múltiples
  private setupCboxMenu(id: string, dim: any, group: any) {
    const chart = dc.cboxMenu(id);
    chart
      .dimension(dim)
      .group(group)
      .multiple(true);
    return chart;
  }

  private setupRangeChart(id: string, dim: any, group: any, domain: [number, number]) {
    const chart = dc.barChart(id);
    chart
      .width(260)
      .height(100)
      .margins({top: 10, right: 10, bottom: 20, left: 25})
      .dimension(dim)
      .group(group)
      .x(d3.scaleLinear().domain(domain))
      .elasticY(true)
      .brushOn(true)
      .colors(['#94a3b8'])
      .gap(1);

    chart.xAxis().ticks(4);
    chart.yAxis().ticks(2);

    return chart;
  }
}
