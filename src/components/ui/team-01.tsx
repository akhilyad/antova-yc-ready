import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { TEAM_FOUNDER_DATA } from '@/constants';

const LinkedinIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <g clipPath="url(#clip-linkedin-team01)">
      <path
        d="M13.633 13.633h-2.37V9.92c0-.885-.017-2.025-1.234-2.025-1.235 0-1.424.965-1.424 1.96v3.778h-2.37V5.998H8.51v1.043h.031a2.5 2.5 0 0 1 2.246-1.233c2.403 0 2.846 1.58 2.846 3.637zM3.56 4.954a1.376 1.376 0 1 1 0-2.751 1.376 1.376 0 0 1 0 2.751m1.185 8.679H2.372V5.998h2.373zM14.815.001H1.18A1.17 1.17 0 0 0 0 1.154v13.691A1.17 1.17 0 0 0 1.18 16h13.635A1.17 1.17 0 0 0 16 14.845V1.153A1.17 1.17 0 0 0 14.815 0"
        fill="currentColor"
      />
    </g>
    <defs>
      <clipPath id="clip-linkedin-team01">
        <rect width="16" height="16" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

interface TeamProps {
  onBackHome?: () => void;
  onAuditClick?: () => void;
}

export const Team = ({ onBackHome, onAuditClick }: TeamProps) => {
  return (
    <section className="min-h-[calc(100vh-120px)] text-[#FFFFFF]">
      <div className="pt-28 pb-20 sm:pt-32 sm:pb-24 lg:pt-40 lg:pb-32">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center gap-10 md:gap-14">
          {/* Header Block */}
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.6,
              ease: [0.21, 0.47, 0.32, 0.98],
            }}
            className="max-w-2xl mx-auto flex flex-col items-center justify-center text-center gap-4"
          >
            <Badge
              variant="outline"
              className="border-[#FFFFFF]/20 text-[#FFFFFF] bg-transparent font-mono text-xs tracking-wider uppercase px-3 py-1 h-auto"
            >
              {TEAM_FOUNDER_DATA.badge}
            </Badge>
            <h1
              className="font-serif-editorial text-4xl sm:text-5xl md:text-6xl font-normal tracking-tight text-[#FFFFFF] leading-[1.06]"
              style={{ textWrap: 'balance' }}
            >
              {TEAM_FOUNDER_DATA.headingPrefix}
              <em className="italic font-normal">
                {TEAM_FOUNDER_DATA.headingItalic}
              </em>
              {TEAM_FOUNDER_DATA.headingSuffix}
            </h1>
          </motion.div>

          {/* Editorial Solo Founder Card (Two-column on desktop, stacked on mobile) */}
          <motion.div
            initial={{ y: 28, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.65,
              delay: 0.1,
              ease: [0.21, 0.47, 0.32, 0.98],
            }}
            className="w-full max-w-3xl mx-auto rounded-2xl border border-[#FFFFFF]/10 bg-black/40 backdrop-blur-md p-6 sm:p-8 md:p-10 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.06)]"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10 items-center">
              {/* Left Column: Founder Photo */}
              <div className="md:col-span-5 flex justify-center">
                <div className="group/photo w-full max-w-[260px] aspect-square overflow-hidden rounded-xl border border-[#FFFFFF]/15 bg-black/40">
                  <img
                    className="w-full h-full object-cover object-top grayscale-[35%] transition-all duration-500 motion-safe:group-hover/photo:scale-105 group-hover/photo:grayscale-0"
                    src={TEAM_FOUNDER_DATA.image}
                    alt={TEAM_FOUNDER_DATA.name}
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              {/* Right Column: Name, Role, Plain-speech Bio & LinkedIn */}
              <div className="md:col-span-7 flex flex-col items-start text-left gap-5">
                <div className="flex w-full items-start justify-between gap-4">
                  <div className="flex flex-col gap-1.5">
                    <h2 className="font-serif-editorial text-2xl md:text-3xl font-normal text-[#FFFFFF]">
                      {TEAM_FOUNDER_DATA.name}
                    </h2>
                    <p className="font-mono-cite text-xs uppercase tracking-wider text-[#FFFFFF]/70">
                      {TEAM_FOUNDER_DATA.role}
                    </p>
                  </div>

                  <a
                    href={TEAM_FOUNDER_DATA.socials.linkedin}
                    aria-label={`${TEAM_FOUNDER_DATA.name} on LinkedIn`}
                    className="inline-flex items-center gap-2 rounded-full border border-[#FFFFFF]/15 bg-black/40 px-3 py-2 text-xs font-mono-cite text-[#FFFFFF] hover:bg-[#D4400F] hover:text-[#FFFFFF] transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFFFFF]"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <LinkedinIcon size={15} />
                    <span>LinkedIn</span>
                  </a>
                </div>

                <div className="h-px w-full bg-[#FFFFFF]/10" />

                <blockquote className="font-sans-body text-base md:text-[17px] leading-[1.65] text-[#FFFFFF]/85">
                  “{TEAM_FOUNDER_DATA.bio}”
                </blockquote>

                <div className="pt-2 flex flex-wrap items-center gap-3 w-full">
                  {onBackHome && (
                    <button
                      type="button"
                      onClick={onBackHome}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#FFFFFF]/15 bg-transparent px-4 py-2.5 text-sm font-medium text-[#FFFFFF] hover:bg-[#FFFFFF]/5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFFFFF]"
                    >
                      <ArrowLeft className="size-4" />
                      Back to overview
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Team;
