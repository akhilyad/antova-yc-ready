import React from 'react';
import {
  BENTO_FEATURES,
  BENTO_PUSHBACK_NOTICES,
  BENTO_SECTION_COPY,
  BentoFeatureItem,
} from '../constants';
import { BentoGrid, BentoGridItem } from './ui/bento-grid';
import { AnimatedList } from './ui/animated-list';
import {
  Code2,
  Database,
  FileSpreadsheet,
  FileText,
  MailCheck,
} from 'lucide-react';

function renderBentoGraphic(graphicType: BentoFeatureItem['graphicType']) {
  if (graphicType === 'excel-export') {
    return (
      <div className="flex flex-col justify-between rounded-xl p-4 h-full min-h-[150px]">
        {/* Formula Bar */}
        <div className="flex items-center justify-between gap-2">
          <code className="font-mono text-xs bg-[#FFFFFF]/5 px-3 py-1.5 rounded border border-[#FFFFFF]/10 text-[#FFFFFF]">
            =RATE(&quot;FAT_2DAY&quot;)
          </code>
          <span className="font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/60">
            .XLSX
          </span>
        </div>

        {/* Table Row */}
        <div className="mt-4 flex items-center justify-between rounded-lg px-4 py-3 font-mono text-xs">
          <span className="font-semibold text-[#FFFFFF]">
            Cell D20: +€4,000
          </span>
          <span className="rounded bg-[#D4400F] px-2.5 py-1 font-medium text-[#FFFFFF]">
            Page 147, line 2
          </span>
        </div>
      </div>
    );
  }

  if (graphicType === 'code-checks') {
    return (
      <div className="flex flex-col justify-between rounded-xl p-4 h-full min-h-[150px] font-mono text-xs text-[#FFFFFF]">
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-[#FFFFFF]/10 pb-1.5">
            <span className="text-[#FFFFFF]/70">Required:</span>
            <span className="font-semibold">31.5 kA</span>
          </div>
          <div className="flex items-center justify-between border-b border-[#FFFFFF]/10 pb-1.5">
            <span className="text-[#FFFFFF]/70">Vendor Bid:</span>
            <span className="font-semibold">25.0 kA</span>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end">
          <span className="bg-[#D4400F] text-[#FFFFFF] font-mono text-xs px-2 py-0.5 rounded font-semibold">
            ⚠ Spec Gap (+€21,000)
          </span>
        </div>
      </div>
    );
  }

  if (graphicType === 'rate-tables') {
    return (
      <div className="flex flex-col justify-between rounded-xl p-4 h-full min-h-[150px]">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[#FFFFFF]/60">
            BENCHMARK SCHEDULE
          </span>
          <span className="rounded border border-[#FFFFFF]/15 bg-[#D4400F] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#FFFFFF]">
            v1.4 Active
          </span>
        </div>

        <div className="pt-3">
          <p className="font-serif text-3xl text-[#FFFFFF]">€2,000</p>
          <p className="mt-1 font-mono text-xs text-[#FFFFFF]/60">
            per excluded FAT day
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[200px] flex-col justify-between rounded-xl p-3">
      {/* Magic UI notification stream: newest clarification lands on top */}
      <div className="relative h-[176px] overflow-hidden">
        <AnimatedList delay={2200} className="gap-2.5">
          {pushbackStream.map((notice, i) => (
            <PushbackNotification key={`${notice.page}-${i}`} {...notice} />
          ))}
        </AnimatedList>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#000000]" />
      </div>

      <div className="mt-2 flex items-center justify-end border-t border-[#FFFFFF]/10 px-1 pt-2">
        <a
          href="#audit"
          className="font-mono text-xs font-semibold text-[#FFFFFF] hover:underline"
        >
          Export Clarification PDF -&gt;
        </a>
      </div>
    </div>
  );
}

const pushbackNotices = BENTO_PUSHBACK_NOTICES.map((line) => {
  const [page, ...rest] = line.split(' - ');
  return { page, request: rest.join(' - ') };
});

// Repeat so the stream keeps arriving for a while, as in the Magic UI demo.
const pushbackStream = Array.from({ length: 8 }, () => pushbackNotices).flat();

function PushbackNotification({
  page,
  request,
}: {
  page: string;
  request: string;
}) {
  return (
    <figure className="relative mx-auto w-full cursor-default overflow-hidden rounded-2xl p-3 transition-all duration-200 ease-in-out hover:scale-[102%]">
      <div className="flex flex-row items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#D4400F]">
          <FileText className="size-4 text-[#FFFFFF]" />
        </div>
        <div className="flex min-w-0 flex-col">
          <figcaption className="flex flex-row items-center whitespace-pre font-mono text-xs font-semibold text-[#FFFFFF]">
            <span>{page}</span>
            <span className="mx-1 text-[#FFFFFF]/60">·</span>
            <span className="font-normal text-[#FFFFFF]/60">queued</span>
          </figcaption>
          <p className="truncate font-sans text-xs text-[#FFFFFF]/75">
            {request}
          </p>
        </div>
      </div>
    </figure>
  );
}

function getBentoIcon(graphicType: BentoFeatureItem['graphicType']) {
  switch (graphicType) {
    case 'excel-export':
      return <FileSpreadsheet className="h-4 w-4 text-[#FFFFFF]" />;
    case 'code-checks':
      return <Code2 className="h-4 w-4 text-[#FFFFFF]" />;
    case 'rate-tables':
      return <Database className="h-4 w-4 text-[#FFFFFF]" />;
    case 'pushback-schedules':
      return <MailCheck className="h-4 w-4 text-[#FFFFFF]" />;
  }
}

export function FeatureBentoSection() {
  return (
    <section
      id="features"
      className="scroll-mt-12 w-full text-[#FFFFFF] py-20 sm:py-24 px-4 sm:px-6"
    >
      <div className="max-w-6xl mx-auto">
        <div className="max-w-3xl mb-12">
          <p className="font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/60">
            {BENTO_SECTION_COPY.eyebrow}
          </p>
          <h2 className="mt-3 font-serif text-3xl md:text-5xl text-[#FFFFFF] tracking-tight">
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
                <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-[#FFFFFF]/60">
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
