import { AfterViewInit, ChangeDetectionStrategy, Component, input, OnDestroy, OnInit, signal } from '@angular/core';

import * as d3 from 'd3';
import * as dc from 'dc';

@Component({
  selector: 'app-charts-view',
  imports: [],
  host: {
    '(window:resize)': 'onResize()'
  },
  templateUrl: './charts-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartsViewComponent implements OnInit, OnDestroy, AfterViewInit {
  ndx = input.required<any>();
  showGuide = signal(true);

  // Variables on guardarem els gràfics i les dimensions
  private charts: any[] = [];
  private dims: any[] = [];

  ngOnInit() {
    this.initCharts();
  }

  ngAfterViewInit() {
    // Retard per assegurar que el DOM està llest i el layout calculat
    setTimeout(() => {
      // Calculem les dimensions inicials
      this.updateChartDimensions();

      // Renderitzem amb DC
      const globalDC = (window as any).dc || dc;
      globalDC.renderAll();
    }, 100);
  }

  ngOnDestroy() {
    this.dims.forEach(d => d.dispose());
  }

  // Mostra/oculta les preguntes
  toggleGuide() {
    this.showGuide.update(v => !v);
  }

  // En redimensionar la finestra hem de recalcular i redibuixar
  onResize() {
    if (!this.charts.length) return;

    requestAnimationFrame(() => {
      this.updateChartDimensions();
      dc.redrawAll();
    });
  }

  // Funció per actualitzar les dimensions dels gràfics
  private updateChartDimensions() {
    // Per cada un dels gràfics
    this.charts.forEach(chart => {
      // Localitzem el contenidor
      const anchor = chart.anchor();
      const div = typeof anchor === 'string' ? document.querySelector(anchor) : anchor;

      // Calculem l'amplada del gràfic segons l'amplada del contenidor
      if (div) {
        let width = div.getBoundingClientRect().width;
        if (width < 50 && div.parentElement) {
          width = div.parentElement.getBoundingClientRect().width;
        }

        const finalWidth = width - 10;

        if (finalWidth > 100) {
          chart.width(finalWidth);

          // Cas especial per al heat map
          if (anchor.includes('heatmap') || anchor === '#survival-heatmap') {
            const newHeight = Math.min(Math.max(450, finalWidth * 0.7), 800);
            chart.height(newHeight);
          }

        }
      }
    });
  }

  // Inicialització dels gràfics
  private initCharts() {
    const globalD3 = (window as any).d3 || d3;
    const globalDC = (window as any).dc || dc;

    if (!globalD3 || !globalDC) {
      console.error('D3 or DC not loaded globally');
      return;
    }

    // Ordre explícit de les variables que s'ordenen incorrectament de forma automàtica
    const pam50Order = ['LumA', 'LumB', 'Her2', 'Basal', 'Normal', 'Claudin-low', 'NC', 'NA'];
    const stageOrder = ['0', '1', '2', '3', '4', 'Unknown', 'NA'];
    const ageOrder = ['<40', '40-49', '50-59', '60-69', '70+'];

    const stageOrderFn = (d: any) => {
      const index = stageOrder.indexOf(d.key);
      return index === -1 ? stageOrder.length : index;
    };
    const pam50OrderFn = (d: any) => {
      const index = pam50Order.indexOf(d.key);
      return index === -1 ? pam50Order.length : index;
    };

    const pam50HeatmapOrderFn = (a: string, b: string) => {
      const aIndex = pam50Order.indexOf(a);
      const bIndex = pam50Order.indexOf(b);
      return (aIndex === -1 ? pam50Order.length : aIndex) - (bIndex === -1 ? pam50Order.length : bIndex);
    };

    // Dimensions de les dades
    const pam50Dim = this.ndx().dimension((d: any) => d.pam50);
    const stageDim = this.ndx().dimension((d: any) => d.stage);
    const heatmapDim = this.ndx().dimension((d: any) => [d.pam50, d.treatmentRegimen]);
    const scatterDim = this.ndx().dimension((d: any) => [d.tumorSize, d.age, d.survival5y]);
    const ageStackDim = this.ndx().dimension((d: any) => d.ageGroup);
    const tumorSizeGroupDim = this.ndx().dimension((d: any) => d.tumorSizeGroup);

    this.dims.push(pam50Dim, stageDim, heatmapDim, scatterDim, ageStackDim, tumorSizeGroupDim);

    // Funció per calcular la taxa de supervivència del dataset
    const reduceSurvival = () => ({
      add: (p: any, v: any) => {
        p.count++;
        p.survived += v.survival5y ? 1 : 0;
        p.rate = p.count ? (p.survived / p.count) : 0;
        return p;
      },
      remove: (p: any, v: any) => {
        p.count--;
        p.survived -= v.survival5y ? 1 : 0;
        p.rate = p.count ? (p.survived / p.count) : 0;
        return p;
      },
      init: () => ({ count: 0, survived: 0, rate: 0 })
    });
    const r = reduceSurvival();

    const stageRateGroup = stageDim.group().reduce(r.add, r.remove, r.init);
    const pam50RateGroup = pam50Dim.group().reduce(r.add, r.remove, r.init);

    // Taxa de supervivència de cada grup del heat map
    const heatmapGroup = heatmapDim.group().reduce(
      (p: any, v: any) => {
        p.total++;
        p.survived += v.survival5y ? 1 : 0;
        p.rate = p.total ? (p.survived / p.total) : 0;
        return p;
      },
      (p: any, v: any) => {
        p.total--;
        p.survived -= v.survival5y ? 1 : 0;
        p.rate = p.total ? (p.survived / p.total) : 0;
        return p;
      },
      () => ({ total: 0, survived: 0, rate: 0 })
    );

    // Preparem les dades per a cada gràfic
    const ageSurvivedGroup = ageStackDim.group().reduceSum((d: any) => d.survival5y ? 1 : 0);
    const ageDeceasedGroup = ageStackDim.group().reduceSum((d: any) => d.survival5y ? 0 : 1);

    const sizeRateGroup = tumorSizeGroupDim.group().reduce(r.add, r.remove, r.init);
    const scatterGroup = scatterDim.group();

    // Configuració dels gràfics amb les funcions definides
    this.setupRateBarChart('#stage-rate-chart', stageDim, stageRateGroup, 'Estadi TNM (0-4)', undefined, stageOrderFn);

    const pamColors = globalD3.scaleOrdinal().range(['#3b82f6', '#14b8a6', '#f59e0b', '#f43f5e', '#6366f1']);
    this.setupRateBarChart('#pam50-rate-chart', pam50Dim, pam50RateGroup, 'Subtipus Molecular', pamColors, pam50OrderFn, true);

    this.setupHeatmap('#survival-heatmap', heatmapDim, heatmapGroup, pam50HeatmapOrderFn);

    this.setupStackedAgeChart('#age-stacked-chart', ageStackDim, ageSurvivedGroup, ageDeceasedGroup, ageOrder);
    this.setupRateBarChart('#size-rate-chart', tumorSizeGroupDim, sizeRateGroup, 'Grup Mida Tumor (mm)');
    this.setupScatterPlot('#scatter-chart', scatterDim, scatterGroup);
  }

  // Funció per calcular l'amplada del gràfic en funció de l'amplada del contenidor
  private getChartWidth(id: string): number {
    const el = document.querySelector(id);
    if (!el) return 600;
    let w = el.getBoundingClientRect().width;
    if (w < 50 && el.parentElement) {
      w = el.parentElement.getBoundingClientRect().width;
    }
    return w > 50 ? w : 600;
  }

  // Funció per a crear un gràfic de barres
  private setupRateBarChart(id: string, dim: any, group: any, xLabel: string, colorScale?: any, orderFn?: (d: any) => number, rotateXLabels = false) {
    const globalD3 = (window as any).d3 || d3;
    const globalDC = (window as any).dc || dc;

    const chart = globalDC.barChart(id);

    chart
      .width(this.getChartWidth(id))
      .height(280)
      .margins({top: 20, right: 20, bottom: 80, left: 50})
      .dimension(dim)
      .group(group)
      .valueAccessor((d: any) => d.value.rate * 100)
      .x(globalD3.scaleBand())
      .xUnits(globalDC.units.ordinal)
      .elasticY(false)
      .y(globalD3.scaleLinear().domain([0, 100]))
      .barPadding(0.2)
      .outerPadding(0.1)
      .yAxisLabel("Taxa Supervivència (%)")
      .xAxisLabel(xLabel)
      .renderTitle(true)
      .title((d: any) => {
        const key = d.key;
        const rate = d.value.rate * 100;
        const count = d.value.count;
        if (count === 0) return `${key}\nSense dades`;
        return `${key}\nTaxa Supervivència: ${rate.toFixed(1)}%\nMostres: ${count}`;
      });


    // En cas de definir l'escala de colors
    if (colorScale) {
      chart.colors(colorScale);
      chart.colorAccessor((d: any) => d.key);
    } else {
      chart.colors(['#64748b']);
    }

    if (orderFn) {
      chart.ordering(orderFn);
    }

    if (rotateXLabels) {
      chart.on('renderlet', (chartInstance: any) => {
        chartInstance.selectAll('g.x.axis g.tick text')
          .attr('transform', 'rotate(-45)')
          .style('text-anchor', 'end')
          .attr('dx', '-.8em')
          .attr('dy', '.15em');
      });
    }


    chart.on('renderlet', (chartInstance: any) => {
      // Mostrem els pecentatges sobre les barres
      chartInstance.selectAll('text.barLabel').remove();
      // Seleccionem totes les barres
      chartInstance.selectAll('rect.bar').each((d: any, i: number, nodes: any) => {
        // Obtenim la barra actual
        const bar = globalD3.select(nodes[i]);

        const rawRate = d.data && d.data.value ? d.data.value.rate : 0;
        const percentage = rawRate * 100;

        // Si no hi ha dades o és 0, no pintem res
        if (!percentage || percentage <= 0) return;

        // Calculem la posició X
        const x = parseFloat(bar.attr('x')) + (parseFloat(bar.attr('width')) / 2);

        // Calculem la posició Y
        const y = parseFloat(bar.attr('y')) - 5;

        // Afegim el text
        chartInstance.select('g.chart-body').append('text')
          .attr('class', 'barLabel')
          .attr('x', x)
          .attr('y', y)
          .attr('text-anchor', 'middle') // Centrat horitzontalment
          .style('fill', '#333')         // Color gris fosc
          .style('font-size', '12px')
          .style('font-weight', 'bold')
          .text(percentage.toFixed(1) + '%');
      });
    });


    chart.yAxis().ticks(5);
    this.charts.push(chart);
    return chart;
  }

  // Funció per crear un heat map
  private setupHeatmap(id: string, dim: any, group: any, colOrderingFn?: (a: string, b: string) => number) {
    const globalD3 = (window as any).d3 || d3;
    const globalDC = (window as any).dc || dc;

    const w = this.getChartWidth(id);
    const h = Math.min(Math.max(450, w * 0.7), 800);

    const survivalColorScale = globalD3.scaleSequential(globalD3.interpolateRdYlGn).domain([0, 1]);

    const chart = globalDC.heatMap(id);
    chart
      .width(w)
      .height(h)
      .margins({ top: 40, right: 20, bottom: 100, left: 150 })
      .dimension(dim)
      .group(group)
      .keyAccessor((d: any) => d.key[0])
      .valueAccessor((d: any) => d.key[1])
      .colorAccessor((d: any) => d.value.rate)
      .colors(survivalColorScale)
      .xBorderRadius(2)
      .yBorderRadius(2)
      .renderTitle(true)
      .title((d: any) => {
        if (!d.value || d.value.total === 0) {
          return `${d.key[0]} - ${d.key[1]}\nSense dades`;
        }
        const rate = d.value.rate * 100;
        return `${d.key[0]}\n${d.key[1]}\nTaxa: ${rate.toFixed(1)}% (${d.value.total} mostres)`;
      });

    if (colOrderingFn) {
      chart.colOrdering(colOrderingFn);
    }

    chart.on('renderlet', (chartInstance: any) => {


      // Etiquetes dels eixos
      chartInstance.selectAll("g.cols.axis text")
        .attr("transform", (d: any, i: number, nodes: any) => {
          const el = d3.select(nodes[i]);
          if (el.empty()) return null;
          const x = parseFloat(el.attr('x') || '0');
          const y = parseFloat(el.attr('y') || '0');
          return `rotate(-45, ${x}, ${y})`;
        })
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em");

      const svg = chartInstance.svg();
      if (svg.select('text.x-axis-label').empty()) {
        svg.append('text')
          .attr('class', 'x-axis-label')
          .attr('text-anchor', 'middle')
          .attr('x', chartInstance.width() / 2)
          .attr('y', chartInstance.height() - 20)
          .style('font-size', '14px')
          .style('font-weight', 'bold')
          .style('fill', '#374151')
          .text('Subtipus Molecular (PAM50)');
      }
      if (svg.select('text.y-axis-label').empty()) {
        svg.append('text')
          .attr('class', 'y-axis-label')
          .attr('text-anchor', 'middle')
          .attr('transform', 'rotate(-90)')
          .attr('y', 20)
          .attr('x', -chartInstance.height() / 2)
          .style('font-size', '14px')
          .style('font-weight', 'bold')
          .style('fill', '#374151')
          .text('Règim de Tractament');
      }

      // Heatmap labels utilitzant l'argument 'nodes' per evitar conflictes amb 'this'
      chartInstance.selectAll('text.heatmap-label').remove();
      chartInstance.selectAll('g.box-group').each((d: any, i: number, nodes: any[]) => {
        const boxGroup = d3.select(nodes[i]);
        const box = boxGroup.select('rect.heat-box');

        if (box.empty() || !d.value || d.value.rate === null || d.value.total === 0) return;

        const width = parseFloat(box.attr('width'));
        const height = parseFloat(box.attr('height'));

        // Si és massa petit no afegim els percentatges
        //if (width < 30 || height < 20) return;

        const x = parseFloat(box.attr('x')) + width / 2;
        const y = parseFloat(box.attr('y')) + height / 2;
        const rate = d.value.rate;
        const textColor = (rate > 0.35 && rate < 0.65) ? '#1f2937' : 'white';

        boxGroup.append('text')
          .attr('class', 'heatmap-label')
          .attr('x', x)
          .attr('y', y)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', textColor)
          .style('font-size', '12px')
          .style('font-weight', 'bold')
          .style('pointer-events', 'none')
          .text(`${(rate * 100).toFixed(0)}%`);
      });
    });

    this.charts.push(chart);
    return chart;
  }

  //Funció per a crear el gràfic de supervivència x edat apilat
  private setupStackedAgeChart(id: string, dim: any, survivedGroup: any, deceasedGroup: any, order?: string[]) {
    const globalD3 = (window as any).d3 || d3;
    const globalDC = (window as any).dc || dc;

    const chart = globalDC.barChart(id);
    chart
      .width(this.getChartWidth(id))
      .height(250)
      .margins({top: 10, right: 20, bottom: 40, left: 50})
      .dimension(dim)
      .group(survivedGroup, 'Supervivents (>5a)')
      .stack(deceasedGroup, 'Difunts (<5a)')
      .x(globalD3.scaleBand())
      .xUnits(globalDC.units.ordinal)
      .elasticY(true)
      .barPadding(0.2)
      .colors(globalD3.scaleOrdinal().range(['#10b981', '#f43f5e']))
      .yAxisLabel("Nombre de Pacients")
      .xAxisLabel("Grup d'Edat")
      .renderTitle(true);

    // Assegurem el tipus de StackLayerContext
    interface StackLayerContext { layer: string; }

    //Títol
    chart.title(function (this: StackLayerContext, d: any) {
      const barKey = d.key;
      const barValue = d.value;
      const layerName = this.layer;

      const currentSurvived = survivedGroup.all().find((item: any) => item.key === barKey)?.value || 0;
      const currentDeceased = deceasedGroup.all().find((item: any) => item.key === barKey)?.value || 0;
      const totalInGroup = currentSurvived + currentDeceased;
      const percentage = totalInGroup > 0 ? (barValue / totalInGroup) * 100 : 0;

      return `${barKey} - ${layerName}\nPacients: ${barValue} (${percentage.toFixed(1)}%)`;
    });

    if (order) {
      chart.ordering((d: any) => {
        const index = order.indexOf(d.key);
        return index === -1 ? order.length : index;
      });
    }

      // Un cop s'hagin completat les transicions mostrem els percentatges
      chart.on('renderlet', (chartInstance: any) => {

      const survivedMap = new Map<any, number>(survivedGroup.all().map((d: any) => [d.key, d.value]));
      const deceasedMap = new Map<any, number>(deceasedGroup.all().map((d: any) => [d.key, d.value]));

      chartInstance.selectAll('g.stack').each((dStack: any, iStack: number, stackNodes: any[]) => {
        const stackGroup = d3.select(stackNodes[iStack]);
        stackGroup.selectAll('text.bar-label').remove();

        stackGroup.selectAll('rect.bar').each((dBar: any, iBar: number, barNodes: any) => {
          const bar = d3.select(barNodes[iBar]);
          const barValue = dBar.data.value;
          const barKey = dBar.data.key;
          const total = (survivedMap.get(barKey) || 0) + (deceasedMap.get(barKey) || 0);

          if (total === 0 || barValue === 0) return;

          const percentage = (barValue / total) * 100;
          const barHeight = parseFloat(bar.attr('height'));

          if (barHeight < 20 || percentage < 8) return;

          const x = parseFloat(bar.attr('x')) + (parseFloat(bar.attr('width')) / 2);
          const y = parseFloat(bar.attr('y')) + barHeight / 2;

          stackGroup.append('text')
            .attr('class', 'bar-label')
            .attr('x', x)
            .attr('y', y)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('fill', 'white')
            .style('font-size', '11px')
            .style('font-weight', '500')
            .style('pointer-events', 'none')
            .text(`${percentage.toFixed(0)}%`);
        });
      });
    });

    this.charts.push(chart);
    return chart;
  }

  // Gràfic de punts per a mida vs edat
  private setupScatterPlot(id: string, dim: any, group: any) {
    const globalD3 = (window as any).d3 || d3;
    const globalDC = (window as any).dc || dc;

    const chart = globalDC.scatterPlot(id);
    chart
      .width(this.getChartWidth(id))
      .height(400)
      .margins({top: 10, right: 20, bottom: 40, left: 50})
      .dimension(dim)
      .group(group)
      .x(globalD3.scaleLinear().domain([0, 100]))
      .brushOn(true)
      .symbolSize(4)
      .clipPadding(10)
      .yAxisLabel("Edat (Anys)")
      .xAxisLabel("Mida del Tumor (mm)")
      .colors(globalD3.scaleOrdinal().domain([true, false]).range(['#10b981', '#f43f5e']))
      .colorAccessor((d: any) => d.key[2])
      .renderTitle(true)
      .title((d: any) => {
        const size = d.key[0];
        const age = d.key[1];
        const survived = d.key[2] ? 'Sí' : 'No';
        return `Mida Tumor: ${size.toFixed(1)} mm\nEdat: ${age.toFixed(0)} anys\nSupervivència >5a: ${survived}`;
      });

    this.charts.push(chart);
    return chart;
  }
}
