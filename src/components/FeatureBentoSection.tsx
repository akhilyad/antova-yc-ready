import React from 'react';
import {
  BENTO_FEATURES,
  BENTO_PUSHBACK_NOTICES,
  BENTO_SECTION_COPY,
  BentoFeatureItem,
} from '../constants';
import { BentoGrid, BentoGridItem } from './ui/bento-grid';
import { AnimatedList } from './ui/animated-list';
import { Code2, Database, FileSpreadsheet, MailCheck } from 'lucide-react';

function renderBentoGraphic(graphicType: BentoFeatureItem['graphicType']) {
  if (graphicType === 'excel-export') {
    return (
      <div className="flex flex-col justify-between rounded-xl border border-[#15120F]/10 bg-[#F6F2EA] p-4 h-full min-h-[150px]">
        {/* Formula Bar */}
        <div className="flex items-center justify-between gap-2">
          <code className="font-mono text-xs bg-[#15120F]/5 px-3 py-1.5 rounded border border-[#15120F]/10 text-[#15120F]">
            =RATE(&quot;FAT_2DAY&quot;)
          </code>
          <span className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
            .XLSX
          </span>
        </div>

        {/* Table Row */}
        <div className="mt-4 flex items-center justify-between rounded-lg border border-[#15120F]/10 bg-[#FDFBF7] px-4 py-3 font-mono text-xs">
          <span className="font-semibold text-[#15120F]">
            Cell D20: +€4,000
          </span>
          <span className="rounded bg-[#FFE98A] px-2.5 py-1 font-medium text-[#15120F]">
            Page 147, line 2
          </span>
        </div>
      </div>
    );
  }

  if (graphicType === 'code-checks') {
    return (
      <div className="flex flex-col justify-between rounded-xl border border-[#15120F]/10 bg-[#F6F2EA] p-4 h-full min-h-[150px] font-mono text-xs text-[#15120F]">
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-[#15120F]/10 pb-1.5">
            <span className="text-[#15120F]/70">Required:</span>
            <span className="font-semibold">31.5 kA</span>
          </div>
          <div className="flex items-center justify-between border-b border-[#15120F]/10 pb-1.5">
            <span className="text-[#15120F]/70">Vendor Bid:</span>
            <span className="font-semibold">25.0 kA</span>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end">
          <span className="bg-[#FFE98A] text-[#15120F] font-mono text-xs px-2 py-0.5 rounded font-semibold">
            ⚠ Spec Gap (+€21,000)
          </span>
        </div>
      </div>
    );
  }

  if (graphicType === 'rate-tables') {
    return (
      <div className="flex flex-col justify-between rounded-xl border border-[#15120F]/10 bg-[#F6F2EA] p-4 h-full min-h-[150px]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#15120F]/60">
            BENCHMARK SCHEDULE
          </span>
          <span className="rounded border border-[#15120F]/15 bg-[#FFE98A] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#15120F]">
            v1.4 Active
          </span>
        </div>

        <div className="pt-3">
          <p className="font-serif text-3xl text-[#15120F]">€2,000</p>
          <p className="mt-1 font-mono text-xs text-[#15120F]/60">
            per excluded FAT day
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between rounded-xl border border-[#15120F]/10 bg-[#F6F2EA] p-4 h-full min-h-[165px]">
      <AnimatedList delay={2800} className="gap-2">
        {BENTO_PUSHBACK_NOTICES.map((notice) => (
          <div
            key={notice}
            className="w-full rounded-lg border border-[#15120F]/10 bg-[#FDFBF7] px-3.5 py-2 font-mono text-xs text-[#15120F] flex items-center justify-between gap-2"
          >
            <span className="truncate">{notice}</span>
            <span className="shrink-0 rounded bg-[#FFE98A] px-2 py-0.5 text-[10px] font-medium text-[#15120F]">
              Queued
            </span>
          </div>
        ))}
      </AnimatedList>

      <div className="mt-3 pt-2 border-t border-[#15120F]/10 flex items-center justify-end">
        <a
          href="#audit"
          className="font-mono text-xs font-semibold text-[#15120F] hover:underline"
        >
          Export Clarification PDF -&gt;
        </a>
      </div>
    </div>
  );
}

function getBentoIcon(graphicType: BentoFeatureItem['graphicType']) {
  switch (graphicType) {
    case 'excel-export':
      return <FileSpreadsheet className="h-4 w-4 text-[#15120F]" />;
    case 'code-checks':
      return <Code2 className="h-4 w-4 text-[#15120F]" />;
    case 'rate-tables':
      return <Database className="h-4 w-4 text-[#15120F]" />;
    case 'pushback-schedules':
      return <MailCheck className="h-4 w-4 text-[#15120F]" />;
  }
}

export function FeatureBentoSection() {
  return (
    <section
      id="features"
      className="scroll-mt-12 w-full bg-[#F6F2EA] text-[#15120F] border-t border-[#15120F]/10 py-20 sm:py-24 px-4 sm:px-6"
    >
      <div className="max-w-6xl mx-auto">
        <div className="max-w-3xl mb-12">
          <p className="font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
            {BENTO_SECTION_COPY.eyebrow}
          </p>
          <h2 className="mt-3 font-serif text-3xl md:text-5xl text-[#15120F] tracking-tight">
            {BENTO_SECTION_COPY.headline}
          </h2>
        </div>

        <BentoGrid>
          {BENTO_FEATURES.map((item) => (
            <BentoGridItem
              key={item.id}
              className={
                item.spanCols === 2 ? 'md:col-span-2' : 'md:col-span-1'
              }
              header={renderBentoGraphic(item.graphicType)}
              icon={
                <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-[#15120F]/60">
                  {getBentoIcon(item.graphicType)}
                  <span>{item.kicker}</span>
                </div>
              }
              title={item.title}
              description={item.description}
            />
          ))}
        </BentoGrid>
      </div>
    </section>
  );
}
