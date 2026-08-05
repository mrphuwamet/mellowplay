import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Heart, ShieldAlert, Lock, Ban, Flag, Scale } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

// Draft content only (per 2026-07-24 product decision) — a generic starting
// point for the community feed's guidelines page. Meant to be reviewed and
// edited by the business before treating it as the real policy.
const SECTIONS_TH = [
  {
    icon: Heart,
    title: 'ให้เกียรติและเป็นมิตรต่อกัน',
    body: 'ชุมชนนี้มีไว้สำหรับผู้ปกครองแบ่งปันเรื่องราวและประสบการณ์ดีๆ เกี่ยวกับลูกๆ พูดคุยกันด้วยความสุภาพ ให้เกียรติความคิดเห็นที่แตกต่าง และหลีกเลี่ยงถ้อยคำที่ทำร้ายจิตใจผู้อื่น',
  },
  {
    icon: ShieldAlert,
    title: 'ห้ามกลั่นแกล้งหรือคุกคาม',
    body: 'ไม่ยอมรับการกลั่นแกล้ง ข่มขู่ ล้อเลียน หรือคุกคามสมาชิกคนอื่นไม่ว่าในรูปแบบใด รวมถึงต่อเด็กที่ปรากฏในโพสต์ของผู้อื่น',
  },
  {
    icon: Lock,
    title: 'ปกป้องความเป็นส่วนตัวของเด็ก',
    body: 'กรุณาขออนุญาตก่อนโพสต์รูปหรือข้อมูลของเด็กคนอื่นที่ไม่ใช่ลูกของคุณ หลีกเลี่ยงการเปิดเผยข้อมูลส่วนตัว เช่น ที่อยู่ โรงเรียน หรือเบอร์โทรศัพท์ ของเด็กคนใดก็ตาม',
  },
  {
    icon: Ban,
    title: 'ห้ามสแปมหรือโฆษณา',
    body: 'พื้นที่นี้ไม่ใช่ช่องทางขายของหรือโฆษณาธุรกิจส่วนตัว โพสต์ที่มีลักษณะเป็นสแปม ลิงก์ที่ไม่เกี่ยวข้อง หรือการโฆษณาซ้ำๆ อาจถูกลบโดยไม่แจ้งล่วงหน้า',
  },
  {
    icon: Flag,
    title: 'รายงานเนื้อหาที่ไม่เหมาะสม',
    body: 'หากพบโพสต์ที่ไม่เหมาะสม สามารถกดปุ่มรายงานที่มุมโพสต์ได้ทันที ทีมงานจะตรวจสอบและดำเนินการตามความเหมาะสม — การรายงานไม่ได้ลบโพสต์ทันที แต่จะถูกส่งให้ทีมงานพิจารณา',
  },
  {
    icon: Scale,
    title: 'ผลจากการฝ่าฝืนแนวทางนี้',
    body: 'โพสต์ที่ฝ่าฝืนแนวทางอาจถูกซ่อนหรือลบโดยทีมงาน และในกรณีที่ฝ่าฝืนซ้ำหรือรุนแรง บัญชีอาจถูกจำกัดการใช้งานฟีเจอร์ชุมชนชั่วคราวหรือถาวร',
  },
];

const SECTIONS_EN = [
  {
    icon: Heart,
    title: 'Be respectful and kind',
    body: 'This community is a place for parents to share stories and experiences about their kids. Keep discussions polite, respect differing opinions, and avoid language that could hurt others.',
  },
  {
    icon: ShieldAlert,
    title: 'No bullying or harassment',
    body: 'Bullying, threats, mockery, or harassment of any member — or of any child shown in someone else’s post — is not tolerated.',
  },
  {
    icon: Lock,
    title: 'Protect children’s privacy',
    body: 'Please ask permission before posting photos or details of a child who isn’t your own. Avoid sharing any child’s personal details such as address, school, or phone number.',
  },
  {
    icon: Ban,
    title: 'No spam or advertising',
    body: 'This space isn’t a channel for selling or promoting personal businesses. Spam-like posts, unrelated links, or repeated ads may be removed without notice.',
  },
  {
    icon: Flag,
    title: 'Report inappropriate content',
    body: 'If you see a post that breaks these guidelines, tap the report button on the post. Our team reviews every report — reporting doesn’t remove a post automatically, it’s sent for review.',
  },
  {
    icon: Scale,
    title: 'Consequences for violations',
    body: 'Posts that break these guidelines may be hidden or removed by our team. Repeated or serious violations may lead to a temporary or permanent restriction on community features.',
  },
];

const CommunityGuidelines: React.FC = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const sections = lang === 'en' ? SECTIONS_EN : SECTIONS_TH;

  return (
    <div className="mellow-page-reading bg-[#fbfaf7]">
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[17px] font-black tracking-tight leading-none">
          {lang === 'en' ? 'Community Guidelines' : 'แนวทางการใช้งานชุมชน'}
        </h1>
        <div className="w-10" />
      </header>

      <main className="p-5 pb-12">
        <p className="text-[14px] text-slate-500 font-medium mb-6 leading-relaxed">
          {lang === 'en'
            ? 'These guidelines keep the Mellow Play community a safe, welcoming space for every family. By posting here, you agree to follow them.'
            : 'แนวทางนี้มีไว้เพื่อให้ชุมชน Mellow Play เป็นพื้นที่ที่ปลอดภัยและเป็นมิตรสำหรับทุกครอบครัว การโพสต์ในชุมชนนี้ถือว่าคุณยอมรับที่จะปฏิบัติตามแนวทางนี้'}
        </p>

        <div className="space-y-4">
          {sections.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 flex gap-4">
                <div className="w-10 h-10 rounded-2xl bg-mellow-purple/10 flex items-center justify-center shrink-0">
                  <Icon size={20} className="text-mellow-purple" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-black text-slate-800 mb-1">{s.title}</h2>
                  <p className="text-[14px] text-slate-500 leading-relaxed">{s.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default CommunityGuidelines;
