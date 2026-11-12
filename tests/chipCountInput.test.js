import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import { h, ref } from 'vue';
import zhTW from '../src/i18n/locales/zh-TW.json';
import ChipCountInput from '../src/components/game/ChipCountInput.vue';
import { chipCountTotal } from '../src/utils/chipDenominations.js';
import { useChipCounts } from '../src/composables/useChipCounts.js';
import { applyPlayerChange } from '../src/utils/ledgerOps.js';

const i18n = () => createI18n({ legacy: false, locale: 'zh-TW', messages: { 'zh-TW': zhTW } });

// The component with its v-model held by a parent, as the room's edit sheet does
function mountWithModel(denominations, initial = {}) {
  const counts = ref(initial);
  const wrapper = mount({
    render: () => h(ChipCountInput, {
      denominations,
      modelValue: counts.value,
      'onUpdate:modelValue': (v) => { counts.value = v; },
    }),
  }, { global: { plugins: [i18n()] } });
  return { wrapper, counts };
}

const SET = [100, 10000, 500, 5000, 1000];

describe('ChipCountInput', () => {
  it('lists the denominations biggest first', () => {
    const { wrapper } = mountWithModel(SET);
    expect(wrapper.findAll('.cc-denom').map((n) => n.text())).toEqual(['10,000', '5,000', '1,000', '500', '100']);
  });

  it('adds the counts up to the example buy-in', async () => {
    const { wrapper, counts } = mountWithModel(SET);
    const inputs = wrapper.findAll('input');
    const typed = [2, 8, 11, 6, 10]; // 10000 / 5000 / 1000 / 500 / 100
    for (let i = 0; i < inputs.length; i++) await inputs[i].setValue(String(typed[i]));
    expect(counts.value).toEqual({ 10000: 2, 5000: 8, 1000: 11, 500: 6, 100: 10 });
    expect(chipCountTotal(counts.value)).toBe(75000);
    expect(wrapper.find('.cc-total-n').text()).toBe('75,000');
    expect(wrapper.findAll('.cc-sub').map((n) => n.text())).toEqual(['20,000', '40,000', '11,000', '3,000', '1,000']);
  });

  it('steps a count up and down, never below zero', async () => {
    const { wrapper, counts } = mountWithModel([5000]);
    const [minus, plus] = wrapper.findAll('.cc-step');
    expect(minus.attributes('disabled')).toBeDefined();
    await plus.trigger('click');
    await plus.trigger('click');
    expect(counts.value).toEqual({ 5000: 2 });
    await minus.trigger('click');
    await minus.trigger('click');
    expect(counts.value).toEqual({});
    expect(wrapper.find('.cc-total-n').text()).toBe('0');
  });

  it('leaves out emptied and zero counts', async () => {
    const { wrapper, counts } = mountWithModel([5000, 1000], { 5000: 8, 1000: 3 });
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('');
    await inputs[1].setValue('0');
    expect(counts.value).toEqual({});
  });

  it('shows saved counts and clears them all at once', async () => {
    const { wrapper, counts } = mountWithModel([5000, 1000], { 5000: 8, 1000: 1 });
    expect(wrapper.findAll('input').map((n) => n.element.value)).toEqual(['8', '1']);
    expect(wrapper.find('.cc-total-n').text()).toBe('41,000');
    await wrapper.find('.cc-clear').trigger('click');
    expect(counts.value).toEqual({});
    expect(wrapper.find('.cc-clear').exists()).toBe(false);
  });
});

// The room's edit sheet: the stack field and the counts under it
describe('useChipCounts', () => {
  const table = (denominations) => ref({ denominations });
  const seat = (extra = {}) => ({ id: 'p1', name: 'A', buyIn: 75000, stack: 0, ...extra });

  it('has no denominations on a table made without them', () => {
    const { denominations } = useChipCounts(ref({}), ref(seat()));
    expect(denominations.value).toEqual([]);
  });

  it('counting chips sets the stack', () => {
    const editing = ref(seat());
    const { setCounts, stackFields } = useChipCounts(table(SET), editing);
    setCounts({ 5000: 8, 1000: 1 });
    expect(editing.value.stack).toBe(41000);
    expect(stackFields()).toEqual({ stack: 41000, stackCounts: { 5000: 8, 1000: 1 } });
  });

  it('typing the stack instead drops the counts', () => {
    const editing = ref(seat());
    const { counts, setCounts, stackFields } = useChipCounts(table(SET), editing);
    setCounts({ 5000: 8 });
    editing.value.stack = 38500;
    expect(counts.value).toEqual({});
    expect(stackFields()).toEqual({ stack: 38500, stackCounts: {} });
  });

  it('reopens with the saved counts only while they match the stack', () => {
    const editing = ref(null);
    const { counts, loadCounts } = useChipCounts(table(SET), editing);
    const saved = seat({ stack: 41000, stackCounts: { 5000: 8, 1000: 1 } });
    editing.value = { ...saved };
    loadCounts(saved);
    expect(counts.value).toEqual({ 5000: 8, 1000: 1 });

    const changed = { ...saved, stack: 40000 };
    editing.value = { ...changed };
    loadCounts(changed);
    expect(counts.value).toEqual({});
  });

  it('what it saves round-trips through the roster', () => {
    const editing = ref(seat());
    const { counts, setCounts, loadCounts, stackFields } = useChipCounts(table(SET), editing);
    setCounts({ 10000: 2, 5000: 8, 1000: 11, 500: 6, 100: 10 });
    const { player } = applyPlayerChange([seat()], { targetId: 'p1' }, { fields: stackFields() });
    expect(player.stack).toBe(75000);
    editing.value = { ...player };
    loadCounts(player);
    expect(counts.value).toEqual({ 10000: 2, 5000: 8, 1000: 11, 500: 6, 100: 10 });
  });
});
