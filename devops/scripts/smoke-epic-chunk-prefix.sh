#!/usr/bin/env bash
# Smoke: epic chunk-prefix (`c0-EPIC-*`) — unit (host) + runtime (Swarm container).
# Exit 0 only when all available layers pass; Docker layer skips with note if no stack.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0

ok() { PASS=$((PASS + 1)); echo "[PASS] $*"; }
fail() { FAIL=$((FAIL + 1)); echo "[FAIL] $*"; }
skip() { SKIP=$((SKIP + 1)); echo "[SKIP] $*"; }

echo "=== T-HOST-1 ai-project-planning-service unit ==="
if node --test services/ai-project-planning-service/tests/reconcileEpicsChunkPrefix.test.js; then
  ok "planning reconcile/derive/map/wbs unit"
else
  fail "planning unit"
fi

echo "=== T-HOST-2 project-service stamp unit ==="
if node --test services/project-service/tests/materializeEpicChunkPrefix.test.js; then
  ok "project stamp/materialize unit"
else
  fail "project stamp unit"
fi

echo "=== T-HOST-3 client Gate1 display unit ==="
if (cd client && node --test src/features/projects/phase1/gate1/epicChunkPrefixDisplay.test.js); then
  ok "client Gate1 display unit"
else
  fail "client Gate1 display unit"
fi

echo "=== T-SWARM-1 planning container runtime ==="
CID="$(docker ps -q -f name=voicehub_ai-project-planning-service 2>/dev/null | head -1 || true)"
if [[ -z "${CID}" ]]; then
  skip "no voicehub_ai-project-planning-service container (deploy stack first)"
else
  if docker exec "$CID" node -e "
const m=require('./src/engines/frEpicCatalog');
const o=m.reconcileEpicsAcrossChunks([{
  epics:[{id:'c0-EPIC-IOT',name:'c0-EPIC-IOT',sourceFrIds:['c0-FR-1'],storyIds:[]}],
  items:[{id:'c0-FR-1',parentEpicId:'c0-EPIC-IOT'}]
}]);
if(o.epics[0].id!=='EPIC-IOT'||o.epics[0].name!=='EPIC-IOT') process.exit(2);
const {buildBacklogStructureFromFr}=require('./src/engines/backlogStructure/buildBacklogStructureFromFr');
(async()=>{
  const d=await buildBacklogStructureFromFr({
    frItems:[{id:'FR-1',name:'A',acceptanceCriteria:'x',parentEpicId:'EPIC-IOT'}],
    epicsCatalog:[{id:'EPIC-IOT',name:'EPIC-IOT'}],
    packId:'smoke',
    sourceSnapshotVersion:'smoke1'
  });
  if(!d.ok||!d.backlogStructure.stories.length) process.exit(3);
  const s=d.backlogStructure.stories[0];
  if(String(s.id)===String(s.sourceFrIds[0])) process.exit(4);
  console.log('container_ok', o.epics[0].id, s.id);
})().catch((e)=>{ console.error(e); process.exit(5); });
"; then
    ok "planning container reconcile+backlogStructure"
  else
    fail "planning container still has old image — rebuild: bash devops/swarm/build-local-images.sh ai-project-planning-service && docker service update --force voicehub_ai-project-planning-service"
  fi
fi

echo "=== T-SWARM-2 project-service container stamp ==="
PCID="$(docker ps -q -f name=voicehub_project-service. 2>/dev/null | head -1 || true)"
if [[ -z "${PCID}" ]]; then
  # fallback: any project-service replica (not worker)
  PCID="$(docker ps --format '{{.ID}} {{.Names}}' 2>/dev/null | awk '/voicehub_project-service\./{print $1; exit}' || true)"
fi
if [[ -z "${PCID}" ]]; then
  skip "no voicehub_project-service container"
else
  if docker exec "$PCID" node -e "
const {materializeApprovedBacklogStructure}=require('./src/utils/srsProposal/materializeApprovedBacklogStructure');
const stamped=materializeApprovedBacklogStructure({
  generated:{
    functionalRequirements:{items:[
      {logicalId:'FR-1',title:'A',parentEpicId:'EPIC-IOT',ac:'x'}
    ]},
    backlogStructure:{
      epics:[{id:'EPIC-IOT',name:'EPIC-IOT',sourceFrIds:['FR-1']}],
      features:[],
      stories:[{id:'STORY-smoke1',title:'A',parentEpicId:'EPIC-IOT',sourceFrIds:['FR-1']}],
      identityReview:[],
      meta:{shapeVersion:'backlog-structure',publishable:true}
    }
  },
  review:{decisions:{'FR-1':{action:'accept'}}}
});
if(!stamped||stamped.meta.shapeVersion!=='backlog-structure') process.exit(2);
if(!stamped.stories[0]||stamped.stories[0].id==='FR-1') process.exit(3);
console.log('stamp_ok', stamped.epics[0].id, stamped.stories[0].id);
"; then
    ok "project-service container stamp"
  else
    fail "project-service container old image — rebuild project-service"
  fi
fi

echo
echo "=== SUMMARY pass=$PASS fail=$FAIL skip=$SKIP ==="
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
