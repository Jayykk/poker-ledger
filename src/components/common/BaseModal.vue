<template>
  <Transition name="fade">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4"
      @click.self="handleClose"
    >
      <Transition name="slide-up">
        <div
          v-if="modelValue"
          class="bg-slate-800 w-full max-w-sm rounded-2xl p-6 mb-20 max-h-[80vh] overflow-y-auto"
        >
          <div v-if="title || $slots.header" class="flex justify-between items-center mb-4">
            <h3 class="text-white font-bold">
              <slot name="header">{{ title }}</slot>
            </h3>
            <button
              v-if="closable"
              @click="handleClose"
              class="text-gray-400 hover:text-white transition"
            >
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <div class="modal-body">
            <slot></slot>
          </div>
          
          <div v-if="$slots.footer" class="mt-4">
            <slot name="footer"></slot>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup>
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: ''
  },
  closable: {
    type: Boolean,
    default: true
  },
  closeOnClickOutside: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['update:modelValue', 'close']);

const handleClose = () => {
  if (props.closeOnClickOutside || props.closable) {
    emit('update:modelValue', false);
    emit('close');
  }
};
</script>
