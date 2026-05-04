<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGameStore } from '../stores/game';
import draggable from 'vuedraggable';
import { 
    Download, Plus, Save, Bot, Zap, 
    Star, Key, Lock, Hammer, Eraser, Trash2,
    ChevronLeft, Waves, Sailboat, Plane, Box, Target, Layers, CircleDashed, Info, Radio, Mountain, LayoutGrid, ToggleLeft, GripVertical
} from 'lucide-vue-next';
import type { Level, CommandType } from '../types';
import { ALL_COMMAND_TYPES } from '../types';

const store = useGameStore();

const ITEM_COLORS: Record<string, string> = {
    blue: '#4cc9f0',
    red: '#ef4444',
    yellow: '#f59e0b'
};

const TRIGGER_COLORS = [
    '#a855f7', '#fb923c', '#f472b6', '#22d3ee', 
    '#f59e0b', '#ef4444', '#22c55e', '#4cc9f0'
];

// Organized tool groups for horizontal layout
const toolGroups = [
    {
        name: 'Terrain',
        items: [
            { id: 'start', label: 'Start', tip: 'Robot spawn point.' },
            { id: 'goal', label: 'Goal', tip: 'Mission target.' },
            { id: 'obstacle', label: 'Wall', tip: 'Solid wall obstacle.' },
            { id: 'water', label: 'Water', tip: 'Hazard. Needs Boat.' },
            { id: 'rock', label: 'Rock', tip: 'Pushable crate.' },
            { id: 'collectible', label: 'Star', tip: 'Must collect all!' },
        ]
    },
    {
        name: 'Items',
        items: [
            { id: 'boat', label: 'Boat', tip: 'Cross Water tiles.' },
            { id: 'plane', label: 'Plane', tip: 'Fly over Walls and Water.' },
            { id: 'keyBlue', label: 'B-Key', color: ITEM_COLORS.blue, tip: 'Opens Blue Doors.' },
            { id: 'keyRed', label: 'R-Key', color: ITEM_COLORS.red, tip: 'Opens Red Doors.' },
            { id: 'keyYellow', label: 'Y-Key', color: ITEM_COLORS.yellow, tip: 'Opens Yellow Doors.' },
        ]
    },
    {
        name: 'Mechanisms',
        items: [
            { id: 'button', label: 'Button', tip: 'Pressure Switch. Active only while pressed.' },
            { id: 'trigDoor', label: 'T-Door', tip: 'Linked by Set ID.' },
            { id: 'doorBlue', label: 'B-Door', color: ITEM_COLORS.blue, tip: 'Needs Blue Key.' },
            { id: 'doorRed', label: 'R-Door', color: ITEM_COLORS.red, tip: 'Needs Red Key.' },
            { id: 'doorYellow', label: 'Y-Door', color: ITEM_COLORS.yellow, tip: 'Needs Yellow Key.' },
        ]
    },
    {
        name: 'Misc',
        items: [
            { id: 'portal1A', label: 'P1-A', color: '#a855f7', tip: 'Purple Portal A.' },
            { id: 'portal1B', label: 'P1-B', color: '#a855f7', tip: 'Purple Portal B.' },
            { id: 'portal2A', label: 'P2-A', color: '#3b82f6', tip: 'Blue Portal A.' },
            { id: 'portal2B', label: 'P2-B', color: '#3b82f6', tip: 'Blue Portal B.' },
            { id: 'eraser', label: 'Clear', tip: 'Clear cell.' }
        ]
    }
];

const activeTool = ref('obstacle');
const currentSetId = ref(1);
const editId = ref(store.currentLevelId);
const localLevel = ref<Level>(JSON.parse(JSON.stringify(store.currentLevel)));

function getTriggerColor(setId: number) {
    return TRIGGER_COLORS[(setId - 1) % TRIGGER_COLORS.length];
}

function displayColor(color?: string) {
    return ITEM_COLORS[color || 'blue'] || color || ITEM_COLORS.blue;
}

function selectLevel(id: string) {
    editId.value = id;
    localLevel.value = JSON.parse(JSON.stringify(store.allLevels[id]));
}

function addNewLevel() {
    const nextIdx = Object.keys(store.allLevels).length + 1;
    const id = `level_${nextIdx}`;
    store.addLevel(id);
    selectLevel(id);
}

function handleCellClick(x: number, y: number) {
    const level = localLevel.value;
    if (activeTool.value === 'obstacle' || activeTool.value === 'water') {
        if ((x === level.start.x && y === level.start.y) || (x === level.goal.x && y === level.goal.y)) return;
    }
    level.obstacles = level.obstacles.filter(ob => ob[0] !== x || ob[1] !== y);
    level.waterTiles = level.waterTiles?.filter(tile => tile.x !== x || tile.y !== y);
    level.boats = level.boats?.filter(tile => tile.x !== x || tile.y !== y);
    level.planes = level.planes?.filter(tile => tile.x !== x || tile.y !== y);
    level.collectibles = level.collectibles?.filter(c => c.x !== x || c.y !== y);
    level.keys = level.keys?.filter(k => k.x !== x || k.y !== y);
    level.doors = level.doors?.filter(d => d.x !== x || d.y !== y);
    level.rocks = level.rocks?.filter(r => r.x !== x || r.y !== y);
    level.triggerButtons = level.triggerButtons?.filter(b => b.x !== x || b.y !== y);
    level.triggerDoors = level.triggerDoors?.filter(d => d.x !== x || d.y !== y);
    if (level.portals) {
        level.portals.forEach(p => {
            if (p.posA.x === x && p.posA.y === y) p.posA = { x: -1, y: -1 };
            if (p.posB.x === x && p.posB.y === y) p.posB = { x: -1, y: -1 };
        });
    }
    const setPortal = (pId: string, type: 'A' | 'B', color: string) => {
        if (!level.portals) level.portals = [];
        let p = level.portals.find(p => p.id === pId);
        if (!p) {
            p = { id: pId, posA: { x: -1, y: -1 }, posB: { x: -1, y: -1 }, color };
            level.portals.push(p);
        }
        if (type === 'A') p.posA = { x, y };
        else p.posB = { x, y };
    };
    switch (activeTool.value) {
        case 'obstacle': level.obstacles.push([x, y]); break;
        case 'water': level.waterTiles = level.waterTiles || []; level.waterTiles.push({ x, y }); break;
        case 'boat': level.boats = level.boats || []; level.boats.push({ x, y }); break;
        case 'plane': level.planes = level.planes || []; level.planes.push({ x, y }); break;
        case 'collectible': level.collectibles = level.collectibles || []; level.collectibles.push({ x, y }); break;
        case 'keyBlue': level.keys = level.keys || []; level.keys.push({ x, y, color: 'blue' }); break;
        case 'keyRed': level.keys = level.keys || []; level.keys.push({ x, y, color: 'red' }); break;
        case 'keyYellow': level.keys = level.keys || []; level.keys.push({ x, y, color: 'yellow' }); break;
        case 'doorBlue': level.doors = level.doors || []; level.doors.push({ x, y, keyRequired: true, color: 'blue' }); break;
        case 'doorRed': level.doors = level.doors || []; level.doors.push({ x, y, keyRequired: true, color: 'red' }); break;
        case 'doorYellow': level.doors = level.doors || []; level.doors.push({ x, y, keyRequired: true, color: 'yellow' }); break;
        case 'rock': level.rocks = level.rocks || []; level.rocks.push({ x, y }); break;
        case 'button':
            if (!level.triggerButtons) level.triggerButtons = [];
            level.triggerButtons.push({ x, y, setId: currentSetId.value, color: getTriggerColor(currentSetId.value) });
            break;
        case 'trigDoor': level.triggerDoors = level.triggerDoors || []; level.triggerDoors.push({ x, y, setId: currentSetId.value, color: getTriggerColor(currentSetId.value) }); break;
        case 'goal': level.goal = { x, y }; break;
        case 'start': level.start.x = x; level.start.y = y; break;
        case 'portal1A': setPortal('p1', 'A', '#a855f7'); break;
        case 'portal1B': setPortal('p1', 'B', '#a855f7'); break;
        case 'portal2A': setPortal('p2', 'A', '#3b82f6'); break;
        case 'portal2B': setPortal('p2', 'B', '#3b82f6'); break;
    }
}

function clearMap() {
    if (!confirm('Are you sure you want to clear this map? This will remove all items, obstacles, and triggers!')) return;
    const level = localLevel.value;
    level.obstacles = [];
    level.waterTiles = [];
    level.boats = [];
    level.planes = [];
    level.collectibles = [];
    level.keys = [];
    level.doors = [];
    level.rocks = [];
    level.triggerButtons = [];
    level.triggerDoors = [];
    level.portals = [];
}

function toggleCommand(cmd: CommandType) {
    if (!localLevel.value.allowedCommands) {
        localLevel.value.allowedCommands = [...ALL_COMMAND_TYPES];
    }
    const idx = localLevel.value.allowedCommands.indexOf(cmd);
    if (idx === -1) {
        localLevel.value.allowedCommands.push(cmd);
    } else {
        localLevel.value.allowedCommands.splice(idx, 1);
    }
}

function saveToStore() {
    if (localLevel.value.portals) {
        localLevel.value.portals = localLevel.value.portals.filter(p => p.posA.x !== -1 && p.posB.x !== -1);
    }
    store.updateLevel(editId.value, localLevel.value);
}

function downloadJSON() {
    const blob = new Blob([JSON.stringify(store.allLevels, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'levels.json';
    link.click();
}

function isObstacle(x: number, y: number) { return localLevel.value.obstacles.some(ob => ob[0] === x && ob[1] === y); }
function isWater(x: number, y: number) { return localLevel.value.waterTiles?.some(tile => tile.x === x && tile.y === y); }
function isBoat(x: number, y: number) { return localLevel.value.boats?.some(tile => tile.x === x && tile.y === y); }
function isPlane(x: number, y: number) { return localLevel.value.planes?.some(tile => tile.x === x && tile.y === y); }
function getCollectible(x: number, y: number) { return localLevel.value.collectibles?.some(c => c.x === x && c.y === y); }
function getKey(x: number, y: number) { return localLevel.value.keys?.find(k => k.x === x && k.y === y); }
function getDoor(x: number, y: number) { return localLevel.value.doors?.find(d => d.x === x && d.y === y); }
function getRock(x: number, y: number) { return localLevel.value.rocks?.some(r => r.x === x && r.y === y); }
function getTriggerButton(x: number, y: number) { return localLevel.value.triggerButtons?.find(b => b.x === x && b.y === y); }
function getTriggerDoor(x: number, y: number) { return localLevel.value.triggerDoors?.find(d => d.x === x && d.y === y); }
function getPortal(x: number, y: number) {
    if (!localLevel.value.portals) return null;
    for (const p of localLevel.value.portals) {
        if (p.posA.x === x && p.posA.y === y) return { id: p.id.slice(-1), type: 'A', color: p.color };
        if (p.posB.x === x && p.posB.y === y) return { id: p.id.slice(-1), type: 'B', color: p.color };
    }
    return null;
}
</script>

<template>
  <div class="flex flex-col gap-4 p-4 bg-slate-950 h-screen overflow-hidden text-slate-200 font-comic">
    <!-- Header -->
    <header class="flex justify-between items-center bg-slate-900 p-4 rounded-2xl shadow-md shrink-0 border border-slate-800">
        <div class="flex items-center gap-4">
            <button @click="store.exitEditor" class="p-2 hover:bg-slate-800 rounded-xl transition-all text-sm font-black flex items-center gap-2 bg-slate-800/40 border border-slate-700">
                <ChevronLeft :size="18" /> Back
            </button>
            <h1 class="text-xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                <Hammer class="text-robot-purple" :size="24" /> Editor Pro
            </h1>
        </div>
        <div class="flex gap-2">
            <button @click="clearMap" class="btn-editor bg-rose-500 hover:bg-rose-600 text-white shadow-lg text-xs px-3 py-1.5"><Trash2 :size="16" /> Clear Map</button>
            <button @click="addNewLevel" class="btn-editor bg-robot-blue text-white shadow-lg text-xs px-3 py-1.5"><Plus :size="16" /> New</button>
            <button @click="downloadJSON" class="btn-editor bg-robot-green text-white shadow-lg text-xs px-3 py-1.5"><Download :size="16" /> Export</button>
        </div>
    </header>

    <main class="flex-1 flex gap-5 overflow-hidden">
        <!-- Sidebar -->
        <aside class="w-72 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2 pb-12">
            <!-- Level Selection -->
            <div class="bg-slate-900 p-4 rounded-2xl shadow-sm border-2 border-slate-800">
                <h3 class="font-black text-slate-500 text-[11px] uppercase mb-3 tracking-widest flex items-center gap-2">
                   <LayoutGrid :size="12" /> Level List
                </h3>
                <draggable 
                    :list="Object.keys(store.allLevels)"
                    item-key="toString"
                    class="flex flex-col gap-1.5"
                    handle=".drag-handle"
                    @change="(e: any) => {
                        if (e.moved) {
                            const keys = Object.keys(store.allLevels);
                            const [movedKey] = keys.splice(e.moved.oldIndex, 1);
                            keys.splice(e.moved.newIndex, 0, movedKey);
                            const newAllLevels: Record<string, Level> = {};
                            keys.forEach(k => { newAllLevels[k] = store.allLevels[k]; });
                            store.allLevels = newAllLevels;
                        }
                    }"
                >
                    <template #item="{ element: id }">
                        <div 
                            @click="selectLevel(id)"
                            class="group w-full text-left p-3 rounded-xl font-black text-[13px] transition-all border-2 flex items-center gap-2 cursor-pointer"
                            :class="editId === id ? 'bg-robot-purple text-white border-robot-purple shadow-md' : 'bg-slate-800 border-transparent hover:border-slate-700 text-slate-400'">
                            <div class="drag-handle p-1 -ml-1 hover:bg-white/10 rounded cursor-grab active:cursor-grabbing">
                                <GripVertical :size="14" class="opacity-50" />
                            </div>
                            <span class="flex-1 truncate">{{ store.allLevels[id].name }}</span>
                        </div>
                    </template>
                </draggable>
            </div>

            <!-- Metadata Editing -->
            <div class="bg-slate-900 p-4 rounded-2xl shadow-sm border-2 border-slate-800 flex flex-col gap-4">
                <h3 class="font-black text-slate-500 text-[11px] uppercase tracking-widest flex items-center gap-2">
                    <Info :size="12" /> Settings
                </h3>
                
                <div class="flex flex-col gap-1.5">
                    <span class="text-[10px] font-black text-slate-500 uppercase ml-1">Title</span>
                    <input v-model="localLevel.name" type="text" class="input-editor py-2 px-4 text-[14px]" />
                </div>

                <div class="flex gap-4">
                    <div class="w-16 flex flex-col gap-1.5">
                        <span class="text-[10px] font-black text-slate-500 uppercase ml-1">Width</span>
                        <input v-model.number="localLevel.gridSize[0]" type="number" class="input-editor py-2 px-2 text-[14px] text-center" />
                    </div>
                    <div class="w-16 flex flex-col gap-1.5">
                        <span class="text-[10px] font-black text-slate-500 uppercase ml-1">Height</span>
                        <input v-model.number="localLevel.gridSize[1]" type="number" class="input-editor py-2 px-2 text-[14px] text-center" />
                    </div>
                    <div class="w-16 flex flex-col gap-1.5">
                        <span class="text-[10px] font-black text-slate-500 uppercase ml-1" title="Set to 0 to disable">Fog R</span>
                        <input v-model.number="localLevel.fogRadius" type="number" min="0" step="0.5" class="input-editor py-2 px-2 text-[14px] text-center bg-slate-800/80 text-robot-pink placeholder:text-robot-pink/30" placeholder="0" />
                    </div>
                </div>

                <div class="flex flex-col gap-1.5">
                    <span class="text-[10px] font-black text-slate-500 uppercase ml-1">Start Direction</span>
                    <div class="grid grid-cols-4 gap-1.5">
                        <button v-for="(dir, idx) in ['North', 'East', 'South', 'West']" :key="idx" 
                            @click="localLevel.start.dir = idx"
                            class="py-1.5 rounded-lg text-[10px] font-black border transition-all"
                            :class="localLevel.start.dir === idx ? 'bg-robot-blue border-robot-blue text-white shadow-md' : 'bg-slate-800 border-slate-700 text-slate-500'">
                            {{ dir }}
                        </button>
                    </div>
                </div>
                
                <!-- Allowed Commands -->
                <div class="p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-[10px] font-black text-slate-500 uppercase tracking-tighter flex items-center gap-1.5"><ToggleLeft :size="12" /> Allowed Commands</span>
                    </div>
                    <div class="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                        <button v-for="cmd in ALL_COMMAND_TYPES" :key="cmd"
                            @click="toggleCommand(cmd)"
                            class="py-1 px-1.5 rounded text-[9px] font-black uppercase text-left truncate transition-all border"
                            :class="(localLevel.allowedCommands || ALL_COMMAND_TYPES).includes(cmd) ? 'bg-robot-purple/20 border-robot-purple text-robot-purple' : 'bg-slate-900 border-slate-800 text-slate-500'">
                            {{ cmd }}
                        </button>
                    </div>
                </div>

                <!-- Set ID Control -->
                <div class="p-3 bg-slate-950/50 rounded-xl border border-slate-800">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Trigger Set Link</span>
                        <div class="w-4 h-4 rounded-full shadow-lg border border-white/20" :style="{ backgroundColor: getTriggerColor(currentSetId) }"></div>
                    </div>
                    <div class="grid grid-cols-4 gap-1.5">
                        <button v-for="id in 8" :key="id" 
                            @click="currentSetId = id"
                            class="h-7 rounded-lg font-black text-[11px] flex items-center justify-center transition-all border"
                            :style="{ 
                                borderColor: currentSetId === id ? getTriggerColor(id) : 'transparent',
                                backgroundColor: currentSetId === id ? getTriggerColor(id) : 'rgba(255,255,255,0.05)',
                                color: currentSetId === id ? 'white' : getTriggerColor(id)
                            }">
                            {{ id }}
                        </button>
                    </div>
                </div>

                <button @click="saveToStore" class="w-full py-4 bg-slate-100 text-slate-900 rounded-2xl font-black mt-1 text-[14px] shadow-xl active:scale-95 hover:bg-white transition-all">
                    <Save :size="18" class="inline-block mr-2" /> Save Changes
                </button>
            </div>
        </aside>

        <!-- Main Editor Area -->
        <section class="flex-1 flex flex-col bg-slate-900 rounded-[2.5rem] shadow-2xl p-6 items-center justify-start relative border border-slate-800 overflow-visible">
            <!-- Grouped Horizontal Toolbar (No scroll, maximized horizontal space) -->
            <div class="w-full flex flex-wrap gap-4 mb-6 bg-slate-950 p-4 rounded-3xl border border-slate-800 shadow-inner shrink-0 relative z-20 overflow-visible">
                <div v-for="group in toolGroups" :key="group.name" class="flex flex-col gap-1.5 pr-4 border-r border-slate-800 last:border-0 last:pr-0">
                    <h4 class="text-[8px] font-black text-slate-700 uppercase tracking-widest ml-1">{{ group.name }}</h4>
                    <div class="flex gap-1.5">
                        <button v-for="tool in group.items" :key="tool.id" 
                            @click="activeTool = tool.id"
                            class="h-14 w-14 rounded-xl font-black text-[10px] uppercase transition-all border-2 flex flex-col items-center justify-center gap-0.5 relative group shadow-sm"
                            :class="activeTool === tool.id ? 'bg-slate-800 text-white border-slate-500 scale-105 shadow-md z-10' : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700'">
                            
                            <div class="flex items-center justify-center h-7 w-full relative">
                                <Eraser v-if="tool.id === 'eraser'" :size="18" />
                                <Box v-if="tool.id === 'rock'" :size="18" />
                                <Target v-if="tool.id === 'button'" :size="18" />
                                <Layers v-if="tool.id === 'trigDoor'" :size="18" />
                                <CircleDashed v-if="tool.id.startsWith('portal')" :size="18" :style="{ color: tool.color }" />
                                <Star v-if="tool.id === 'collectible'" :size="18" />
                                <Bot v-if="tool.id === 'start'" :size="18" />
                                <Zap v-if="tool.id === 'goal'" :size="18" />
                                <Waves v-if="tool.id === 'water'" :size="18" />
                                <Sailboat v-if="tool.id === 'boat'" :size="18" />
                                <Plane v-if="tool.id === 'plane'" :size="18" />
                                <Mountain v-if="tool.id === 'obstacle'" :size="18" />
                                
                                <Key v-if="tool.id.startsWith('key')" :size="20" :style="{ color: tool.color }" stroke-width="3" />
                                <Lock v-if="tool.id.startsWith('door')" :size="20" :style="{ color: tool.color }" stroke-width="3" />
                            </div>
                            <span class="text-[6px] font-black opacity-80 uppercase leading-none truncate w-full px-0.5 text-center">{{ tool.label }}</span>

                            <!-- Tooltip: Always pops down to avoid screen clipping -->
                            <div class="absolute top-full mt-3 left-1/2 -translate-x-1/2 px-3 py-2 bg-slate-800 text-slate-100 text-[10px] font-bold rounded-xl border border-slate-700 shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all w-44 text-center leading-relaxed z-[100] transform translate-y-[-5px] group-hover:translate-y-0">
                                <div class="text-robot-blue mb-0.5 uppercase text-[8px] font-black tracking-widest">{{ tool.label }}</div>
                                {{ tool.tip }}
                                <div class="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-slate-700"></div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Level Grid (No clipping for tooltips) -->
            <div class="flex-1 w-full flex items-start justify-center pt-2 overflow-auto custom-scrollbar relative z-10">
                <div class="grid bg-slate-800 border-8 border-slate-700 rounded-3xl overflow-hidden shadow-2xl relative shrink-0"
                    :style="{
                        gridTemplateColumns: `repeat(${localLevel.gridSize[0]}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${localLevel.gridSize[1]}, minmax(0, 1fr))`,
                        width: `min(660px, 95%)`,
                        aspectRatio: `${localLevel.gridSize[0]}/${localLevel.gridSize[1]}`
                    }">
                    <div v-for="y in localLevel.gridSize[1]" :key="`row-${y}`" class="contents">
                        <div v-for="x in localLevel.gridSize[0]" :key="`cell-${x-1}-${y-1}`"
                            @click="handleCellClick(x-1, y-1)"
                            class="border-[0.5px] border-slate-700 bg-slate-900 hover:bg-slate-800 cursor-crosshair flex items-center justify-center transition-colors relative overflow-hidden">
                            <!-- Walls -->
                            <div v-if="isObstacle(x-1, y-1)" class="obstacle-rock w-full h-full"></div>
                            
                            <!-- Hazards -->
                            <div v-if="isWater(x-1, y-1)" class="w-full h-full bg-sky-900/40 border-2 border-sky-500/30 flex items-center justify-center">
                                <Waves :size="38" class="text-sky-500" stroke-width="3" />
                            </div>
                            
                            <!-- Pickups -->
                            <div v-if="isBoat(x-1, y-1)" class="w-full h-full flex items-center justify-center">
                                <Sailboat :size="36" class="text-cyan-500" />
                            </div>
                            <div v-if="isPlane(x-1, y-1)" class="w-full h-full flex items-center justify-center">
                                <Plane :size="32" class="text-emerald-500" />
                            </div>
                            <Star v-if="getCollectible(x-1, y-1)" :size="34" fill="#FFCA3A" class="text-amber-500" />
                            <Key v-if="getKey(x-1, y-1)" :size="32" :color="displayColor(getKey(x-1, y-1)?.color)" />
                            
                            <!-- Rocks -->
                            <div v-if="getRock(x-1, y-1)" class="w-full h-full flex items-center justify-center p-1">
                                <div class="w-full h-full bg-slate-600 rounded-lg border-b-4 border-slate-800 flex items-center justify-center shadow-lg">
                                    <Box :size="28" class="text-slate-400" />
                                </div>
                            </div>

                            <!-- Triggers -->
                            <div v-if="getTriggerButton(x-1, y-1)" class="w-full h-full flex items-center justify-center p-1.5 opacity-60">
                                <div class="w-full h-full rounded-full border-2 flex items-center justify-center" :style="{ borderColor: getTriggerColor(getTriggerButton(x-1, y-1)!.setId) }">
                                    <Target :size="20" :style="{ color: getTriggerColor(getTriggerButton(x-1, y-1)!.setId) }" />
                                    <span class="absolute text-[10px] font-black translate-x-4 -translate-y-3" :style="{ color: getTriggerColor(getTriggerButton(x-1, y-1)!.setId) }">
                                        {{ getTriggerButton(x-1, y-1)!.setId }}
                                    </span>
                                </div>
                            </div>

                            <div v-if="getTriggerDoor(x-1, y-1)" class="w-full h-full flex items-center justify-center border-4 relative" :style="{ backgroundColor: 'rgba(0,0,0,0.4)', borderColor: getTriggerColor(getTriggerDoor(x-1, y-1)!.setId) }">
                                <Lock :size="24" class="text-white opacity-40" />
                                <div class="absolute -top-1.5 -left-1.5 bg-slate-900 border px-1.5 rounded-full flex items-center justify-center" :style="{ borderColor: getTriggerColor(getTriggerDoor(x-1, y-1)!.setId) }">
                                    <Radio :size="10" :color="getTriggerColor(getTriggerDoor(x-1, y-1)!.setId)" />
                                </div>
                            </div>

                            <!-- Regular Doors -->
                            <div v-if="getDoor(x-1, y-1)" class="w-full h-full flex items-center justify-center border-2 relative" :style="{ backgroundColor: displayColor(getDoor(x-1, y-1)?.color) }">
                                <Lock :size="30" class="text-white" />
                                <div class="absolute -top-1.5 -left-1.5 bg-slate-900 border px-1.5 rounded-full flex items-center justify-center shadow-md" :style="{ borderColor: displayColor(getDoor(x-1, y-1)?.color) }">
                                    <Key :size="10" :color="displayColor(getDoor(x-1, y-1)?.color)" />
                                </div>
                            </div>

                            <!-- Special -->
                            <div v-if="getPortal(x-1, y-1)" 
                                 class="w-10 h-10 border-2 border-dashed rounded-full animate-spin flex items-center justify-center text-[12px] font-black"
                                 :style="{ color: getPortal(x-1, y-1)?.color, borderColor: getPortal(x-1, y-1)?.color }">
                                {{ getPortal(x-1, y-1)?.id }}{{ getPortal(x-1, y-1)?.type }}
                            </div>
                            <Zap v-if="localLevel.goal.x === x-1 && localLevel.goal.y === y-1" :size="40" class="text-robot-green fill-robot-green" />
                            <div v-if="localLevel.start.x === x-1 && localLevel.start.y === y-1" class="w-10 h-10 bg-robot-blue rounded-xl border-2 border-white flex items-center justify-center shadow-xl transition-transform" :style="{ transform: `rotate(${localLevel.start.dir * 90}deg)` }">
                                <Bot :size="24" color="white" />
                                <ChevronUp :size="12" class="absolute -top-3 text-white" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </main>
  </div>
</template>

<style scoped>
@reference "../style.css";
.btn-editor { @apply px-3 py-1.5 rounded-2xl font-black flex items-center gap-2 shadow-sm transition-all active:scale-95; }
.input-editor { @apply bg-slate-800 border-2 border-slate-700 rounded-[1.25rem] font-black focus:border-robot-purple outline-none text-slate-100 shadow-inner transition-all; }
.input-editor:focus { @apply bg-slate-900 border-robot-purple ring-4 ring-robot-purple/10; }
.obstacle-rock { @apply bg-slate-600; background: linear-gradient(135deg, #475569 0%, #1e293b 100%); }

/* Tooltip dynamic styling */
.group:hover .group-hover\:opacity-100 {
    opacity: 1;
}
</style>
