import { Mic, Plus, Video, VideoOff, MicOff, X } from 'lucide-react';
import UserAvatar from '../Shared/UserAvatar';
import {
  FIGMA_VOICE_LOBBY_CREATE_CARD,
  FIGMA_VOICE_LOBBY_CREATE_ICON,
  FIGMA_VOICE_LOBBY_JOIN_CARD,
  FIGMA_VOICE_LOBBY_PREJOIN_GRID,
  FIGMA_VOICE_LOBBY_PRIMARY_BTN,
  FIGMA_VOICE_MODAL_BACKDROP,
  FIGMA_VOICE_MODAL_HEADER,
  FIGMA_VOICE_MODAL_SHELL,
} from './figmaVoiceClasses';

export default function VoiceCreateMeetingModal({
  open,
  onClose,
  onStart,
  startDisabled = false,
  startLabel,
  starting = false,
  t,
  prejoinVideoRef,
  prejoinVideoEnabled,
  onPrejoinVideoEnabledChange,
  prejoinAudioEnabled,
  onPrejoinAudioEnabledChange,
  meetingCode,
  roomKind,
  onRoomKindChange,
  selectedOrgId,
  onSelectedOrgIdChange,
  selectedDeptId,
  onSelectedDeptIdChange,
  organizations = [],
  departments = [],
  orgsLoading = false,
  displayNameInput,
  onDisplayNameInputChange,
  localDisplayName,
  localAvatar,
  user,
}) {
  if (!open) return null;

  return (
    <div
      className={FIGMA_VOICE_MODAL_BACKDROP}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-create-meeting-title"
        className={`${FIGMA_VOICE_MODAL_SHELL} my-auto max-h-[min(calc(100dvh-2rem),720px)] max-w-5xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${FIGMA_VOICE_MODAL_HEADER} px-5 py-4`}>
          <div>
            <h2 id="voice-create-meeting-title" className="text-lg font-semibold text-foreground">
              {t('voiceRoom.createTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('voiceRoom.controlsTitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('voiceRoom.closeAria')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className={FIGMA_VOICE_LOBBY_PREJOIN_GRID}>
            <section className={`${FIGMA_VOICE_LOBBY_CREATE_CARD} min-w-0`}>
              <div className={FIGMA_VOICE_LOBBY_CREATE_ICON}>
                <Video className="h-[22px] w-[22px] text-primary-foreground" aria-hidden />
              </div>
              <h3 className="mb-2 text-base font-semibold text-foreground">
                {t('voiceRoom.previewTitle')}
              </h3>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                {t('voiceRoom.previewSubtitle')}
              </p>
              <div className="overflow-hidden rounded-2xl border border-border bg-background/70 shadow-inner">
                <div className="relative aspect-video max-h-[min(36vh,280px)] w-full bg-black">
                  {prejoinVideoEnabled ? (
                    <video
                      ref={prejoinVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface-raised to-background">
                      <UserAvatar
                        avatar={localAvatar}
                        userId={user?.id || user?._id}
                        name={displayNameInput || localDisplayName}
                        size="2xl"
                      />
                      <span className="text-sm text-muted-foreground">{t('voiceRoom.camOffShort')}</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 border-t border-border bg-surface p-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onPrejoinAudioEnabledChange?.(!prejoinAudioEnabled)}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      prejoinAudioEnabled
                        ? 'border border-border bg-background text-foreground hover:border-primary/30'
                        : 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90'
                    }`}
                  >
                    {prejoinAudioEnabled ? (
                      <Mic className="h-4 w-4" aria-hidden />
                    ) : (
                      <MicOff className="h-4 w-4" aria-hidden />
                    )}
                    {prejoinAudioEnabled ? t('voiceRoom.micOn') : t('voiceRoom.micOff')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onPrejoinVideoEnabledChange?.(!prejoinVideoEnabled)}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      prejoinVideoEnabled
                        ? 'border border-border bg-background text-foreground hover:border-primary/30'
                        : 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90'
                    }`}
                  >
                    {prejoinVideoEnabled ? (
                      <Video className="h-4 w-4" aria-hidden />
                    ) : (
                      <VideoOff className="h-4 w-4" aria-hidden />
                    )}
                    {prejoinVideoEnabled ? t('voiceRoom.camOn') : t('voiceRoom.camBtnOff')}
                  </button>
                </div>
              </div>
            </section>

            <section className={`${FIGMA_VOICE_LOBBY_JOIN_CARD} min-w-0`}>
              <div className="mb-[18px] flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
                <Plus className="h-[22px] w-[22px] text-cyan-400" aria-hidden />
              </div>
              <h3 className="mb-2 text-base font-semibold text-foreground">{t('voiceRoom.createTitle')}</h3>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                {t('voiceRoom.controlsTitle')}
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                    {t('voiceRoom.roomCode')}
                  </label>
                  <input
                    value={meetingCode}
                    readOnly
                    className="h-11 w-full cursor-default rounded-[9px] border border-border bg-muted px-3 font-mono text-[0.9375rem] tracking-[0.08em] text-muted-foreground outline-none"
                  />
                </div>

                <div>
                  <span className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                    {t('voiceRoom.roomKind')}
                  </span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      { id: 'free', label: t('voiceRoom.roomTypeFree') },
                      { id: 'org', label: t('voiceRoom.roomTypeOrg') },
                    ].map((kind) => (
                      <button
                        key={kind.id}
                        type="button"
                        onClick={() => onRoomKindChange?.(kind.id)}
                        className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                          roomKind === kind.id
                            ? 'border-primary/40 bg-primary/10 text-primary shadow-sm'
                            : 'border-border bg-surface text-foreground hover:border-primary/25 hover:bg-muted'
                        }`}
                      >
                        {kind.label}
                      </button>
                    ))}
                  </div>
                </div>

                {roomKind === 'org' ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                        {t('voiceRoom.orgLabel')}
                      </span>
                      <select
                        value={selectedOrgId}
                        onChange={(e) => onSelectedOrgIdChange?.(e.target.value)}
                        disabled={orgsLoading}
                        className="h-11 w-full rounded-[9px] border border-border bg-input-background px-3 text-sm text-foreground outline-none transition focus:border-primary disabled:opacity-50"
                      >
                        <option value="">
                          {orgsLoading ? t('common.loadingEllipsis') : t('voiceRoom.selectOrgPh')}
                        </option>
                        {organizations.map((o) => (
                          <option key={String(o._id || o.id)} value={String(o._id || o.id)}>
                            {o.name || t('common.org')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                        {t('voiceRoom.deptLabel')}
                      </span>
                      <select
                        value={selectedDeptId}
                        onChange={(e) => onSelectedDeptIdChange?.(e.target.value)}
                        disabled={!selectedOrgId}
                        className="h-11 w-full rounded-[9px] border border-border bg-input-background px-3 text-sm text-foreground outline-none transition focus:border-primary disabled:opacity-50"
                      >
                        <option value="">{t('voiceRoom.selectDeptPh')}</option>
                        {departments.map((d) => (
                          <option key={String(d._id || d.id)} value={String(d._id || d.id)}>
                            {d.name || t('common.department')}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                    {t('voiceRoom.displayName')}
                  </span>
                  <input
                    value={displayNameInput}
                    onChange={(e) => onDisplayNameInputChange?.(e.target.value)}
                    placeholder={localDisplayName}
                    className="h-11 w-full rounded-[9px] border border-border bg-input-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary"
                  />
                </label>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={!prejoinAudioEnabled}
                      onChange={(e) => onPrejoinAudioEnabledChange?.(!e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                    />
                    {t('voiceRoom.muteJoin')}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={!prejoinVideoEnabled}
                      onChange={(e) => onPrejoinVideoEnabledChange?.(!e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                    />
                    {t('voiceRoom.camOffJoin')}
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={onStart}
                disabled={startDisabled}
                className={`${FIGMA_VOICE_LOBBY_PRIMARY_BTN} mt-6 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0`}
              >
                <Mic className="h-[15px] w-[15px]" aria-hidden />
                {starting ? t('voiceRoom.connectingRoom') : startLabel}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full rounded-lg py-2 text-center text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                {t('nav.cancel')}
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
