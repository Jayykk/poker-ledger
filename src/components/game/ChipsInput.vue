<template>
  <div class="space-y-2">
    <!-- Manual input -->
    <div class="flex items-center gap-2">
      <input
        :value="modelValue"
        @input="handleInput"
        type="number"
        class="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-center font-mono focus:outline-none focus:border-amber-500"
        :placeholder="placeholder"
      />
    </div>

    <!-- Quick buttons -->
    <div class="grid grid-cols-6 gap-2">
      <button
        v-for="amount in quickAmounts"
        :key="amount"
        @click="addAmount(amount)"
        :class="[
          'px-2 py-1.5 rounded-lg text-xs font-bold transition',
          amount > 0 
            ? 'bg-emerald-700 hover:bg-emerald-600 text-white' 
            : 'bg-rose-700 hover:bg-rose-600 text-white'
        ]"
      >
        {{ amount > 0 ? '+' : '' }}{{ amount }}
      </button>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Number,
    default: 0
  },
  placeholder: {
    type: String,
    default: '0'
  }
});

const emit = defineEmits(['update:modelValue']);

const quickAmounts = [100, 500, 1000, -100, -500, -1000];

const handleInput = (e) => {
  const value = parseInt(e.target.value) || 0;
  emit('update:modelValue', value);
};

const addAmount = (amount) => {
  emit('update:modelValue', props.modelValue + amount);
};
</script>
