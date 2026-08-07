<script setup lang="ts">


definePageMeta({ layout: 'admin', middleware: 'admin' })

const { data: products, pending, refresh } = await useFetch<any[]>('/api/admin/products')
const { data: allCategories, refresh: refreshCategories } = await useFetch<any[]>('/api/categories')
const toast = useCosmicToast()

const searchQuery = ref('')
const selectedCategory = ref('')

const categoryTree = computed(() => {
  if (!allCategories.value) return []
  const map = new Map()
  allCategories.value.forEach((cat) => map.set(cat.id, { ...cat, children: [] }))
  const tree: any[] = []
  allCategories.value.forEach((cat) => {
    const node = map.get(cat.id)
    if (cat.parentId) {
      const parent = map.get(cat.parentId)
      if (parent) parent.children.push(node)
    } else {
      tree.push(node)
    }
  })
  return tree
})

function getCategoryPath(id: number | null): string {
  if (!id || !allCategories.value) return ''
  const path: string[] = []
  let current = allCategories.value.find((c) => c.id === id)
  while (current) {
    path.unshift(current.name)
    const nextId = current.parentId
    current = nextId ? allCategories.value.find((c) => c.id === nextId) : null
  }
  return path.join(' › ')
}

const filteredProducts = computed(() => {
  if (!products.value) return []
  let r = products.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    r = r.filter((p: any) => p.title.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
  }
  if (selectedCategory.value) r = r.filter((p: any) => p.category === selectedCategory.value)
  return r
})

const showModal = ref(false)
const isEditing = ref(false)
const editingProduct = ref<any>(null)
const form = ref({
  title: '',
  description: '',
  price: 0,
  image: '',
  images: [] as string[],
  stock: 0,
  category: '',
  categoryId: null as number | null,
})

const pickerPath = ref<any[]>([])
const currentLevelCategories = computed(() =>
  pickerPath.value.length === 0
    ? categoryTree.value
    : pickerPath.value[pickerPath.value.length - 1].children || [],
)
function selectLevel(cat: any) {
  if (cat.children?.length) pickerPath.value.push(cat)
  else {
    form.value.categoryId = cat.id
    form.value.category = cat.name
  }
}
function resetPicker() { pickerPath.value = [] }
function setFinalCategory(cat: any) {
  form.value.categoryId = cat.id
  form.value.category = cat.name
}

// Deleting an existing category, guarded by the same double-click pattern the
// product delete uses. Products in it survive (the endpoint unlinks them) and
// its subcategories move up one level.
const pendingDeleteCatId = ref<number | null>(null)
let catConfirmUntil = 0
async function deleteCategory(cat: any) {
  const now = Date.now()
  if (pendingDeleteCatId.value !== cat.id || now > catConfirmUntil) {
    pendingDeleteCatId.value = cat.id
    catConfirmUntil = now + 5000
    toast.info('Potvrď smazání', `Klikni znovu pro smazání „${cat.name}".`)
    return
  }
  try {
    await $fetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' })
    if (form.value.categoryId === cat.id) { form.value.categoryId = null; form.value.category = '' }
    pickerPath.value = []
    await refreshCategories()
    await refresh()
    toast.success('Smazáno', `Kategorie „${cat.name}" odstraněna.`)
  } catch (e: any) {
    toast.error('Chyba', e?.data?.statusMessage || e?.message || 'Kategorii se nepodařilo smazat.')
  } finally {
    pendingDeleteCatId.value = null
  }
}

// ── Inline category creation ──────────────────────────────────────────────
// Lets the admin add a brand-new category (or subcategory) straight from the
// product form. The new category is created under whatever level the picker is
// currently drilled into, then auto-selected for the product.
const showNewCat = ref(false)
const newCatName = ref('')
const creatingCat = ref(false)
// Where a new category would be created: the level the picker is currently in.
const newCatParent = computed(() =>
  pickerPath.value.length ? pickerPath.value[pickerPath.value.length - 1] : null,
)
function openNewCat() {
  newCatName.value = ''
  showNewCat.value = true
}
async function createCategory() {
  const name = newCatName.value.trim()
  if (!name || creatingCat.value) return
  creatingCat.value = true
  try {
    const created: any = await $fetch('/api/admin/categories', {
      method: 'POST',
      body: { name, parentId: newCatParent.value?.id ?? null },
    })
    await refreshCategories()
    // Auto-select the freshly created category for this product. Reset the
    // picker so its grid rebuilds from the fresh tree (the old pickerPath nodes
    // don't know about the new child).
    form.value.categoryId = created.id
    form.value.category = created.name
    pickerPath.value = []
    showNewCat.value = false
    newCatName.value = ''
    toast.success('Kategorie přidána', created.name)
  } catch (e: any) {
    toast.error('Chyba', e?.data?.statusMessage || e?.message || 'Kategorii se nepodařilo vytvořit.')
  } finally {
    creatingCat.value = false
  }
}

const uploading = ref(false)
const uploadError = ref('')
const MAX_IMAGES = 5

function openCreate() {
  isEditing.value = false
  editingProduct.value = null
  form.value = { title: '', description: '', price: 0, image: '', images: [], stock: 0, category: '', categoryId: null }
  uploadError.value = ''
  pickerPath.value = []
  showNewCat.value = false
  closeCropper()
  showModal.value = true
}
function openEdit(product: any) {
  isEditing.value = true
  editingProduct.value = product
  form.value = {
    title: product.title,
    description: product.description || '',
    price: product.price,
    image: product.image || '',
    images: product.images || [],
    stock: product.stock,
    category: product.category || '',
    categoryId: product.categoryId || null,
  }
  uploadError.value = ''
  pickerPath.value = []
  showNewCat.value = false
  closeCropper()
  showModal.value = true
}

// ── Photo editor (ImageCropper) ───────────────────────────────────────────
// Nothing is uploaded raw any more: every picked file goes through the 5:4
// cropper first, so the photo the owner frames is exactly what the product card
// shows. Files are queued — the editor walks them one at a time.
const cropQueue = ref<File[]>([])
// Set only when re-editing an image that is already in `form.images`; the result
// then replaces that slot instead of appending a new one.
const cropReplaceIndex = ref<number | null>(null)
const preparingEdit = ref<number | null>(null)

// Uploads are chained so two quick "Použít" clicks can't race each other into
// form.images in the wrong order.
let uploadChain: Promise<void> = Promise.resolve()
let inflightUploads = 0

function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  // Copy the FileList into a real array BEFORE clearing the input. `input.files`
  // is a LIVE FileList — resetting `input.value` empties it, so reading it
  // afterwards yields nothing and the editor never opens.
  const picked = Array.from(input.files)
  // Clearing lets the same file be picked again and still fire `change`.
  input.value = ''

  const remaining = MAX_IMAGES - form.value.images.length
  if (remaining <= 0) { uploadError.value = `Maximálně ${MAX_IMAGES} obrázků`; return }
  uploadError.value = ''
  cropReplaceIndex.value = null
  cropQueue.value = picked.slice(0, remaining)
}

async function uploadCropped(blob: Blob, fileName: string, replaceIndex: number | null) {
  inflightUploads += 1
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', blob, fileName)
    const result = await $fetch<{ url: string }>('/api/admin/upload', { method: 'POST', body: formData })
    if (replaceIndex !== null && replaceIndex >= 0 && replaceIndex < form.value.images.length) {
      const previous = form.value.images[replaceIndex]
      form.value.images[replaceIndex] = result.url
      if (form.value.image === previous || !form.value.image) form.value.image = result.url
    } else if (form.value.images.length < MAX_IMAGES) {
      form.value.images.push(result.url)
      if (!form.value.image) form.value.image = result.url
    } else {
      uploadError.value = `Maximálně ${MAX_IMAGES} obrázků`
    }
  } catch (e: any) {
    uploadError.value = e.data?.message || e.data?.statusMessage || e.message || 'Chyba při nahrávání'
  } finally {
    inflightUploads -= 1
    if (inflightUploads === 0) uploading.value = false
  }
}

function onCropApply(result: { blob: Blob; previewUrl: string; fileName: string }) {
  const replaceIndex = cropReplaceIndex.value
  uploadChain = uploadChain
    .then(() => uploadCropped(result.blob, result.fileName, replaceIndex))
    // The cropper hands over the object URL; we own it from here on.
    .finally(() => URL.revokeObjectURL(result.previewUrl))
}

function closeCropper() {
  cropQueue.value = []
  cropReplaceIndex.value = null
}

// Re-crop an image that's already attached. The original upload is gone (the
// server keeps only the re-encoded WebP), so we pull that file back down and
// feed it to the editor again.
async function editImage(index: number) {
  const url = form.value.images[index]
  if (!url || preparingEdit.value !== null) return
  preparingEdit.value = index
  uploadError.value = ''
  try {
    const res = await fetch(getImageSrc(url))
    if (!res.ok) throw new Error('fetch failed')
    const blob = await res.blob()
    const name = url.split('/').pop() || 'obrazek.webp'
    cropReplaceIndex.value = index
    cropQueue.value = [new File([blob], name, { type: blob.type || 'image/webp' })]
  } catch {
    uploadError.value = 'Obrázek se nepodařilo načíst k úpravě.'
  } finally {
    preparingEdit.value = null
  }
}

function setAsThumbnail(url: string) { form.value.image = url }
function removeImage(index: number) {
  const removed = form.value.images.splice(index, 1)[0]
  if (form.value.image === removed) form.value.image = form.value.images[0] || ''
}

const saving = ref(false)
async function saveProduct() {
  saving.value = true
  try {
    const payload = { ...form.value, images: form.value.images }
    if (isEditing.value && editingProduct.value) {
      await $fetch(`/api/admin/products/${editingProduct.value.id}`, { method: 'PUT', body: payload })
    } else {
      await $fetch('/api/admin/products', { method: 'POST', body: payload })
    }
    showModal.value = false
    await refresh()
    toast.success('Uloženo', isEditing.value ? 'Produkt upraven.' : 'Produkt vytvořen.')
  } catch (e: any) {
    toast.error('Chyba', e?.data?.statusMessage || e?.message || 'Nepodařilo se uložit.')
  } finally {
    saving.value = false
  }
}

const deletingId = ref<number | null>(null)
const pendingDeleteId = ref<number | null>(null)
const deleteConfirmUntil = ref(0)
async function deleteProduct(id: number) {
  const now = Date.now()
  if (pendingDeleteId.value !== id || now > deleteConfirmUntil.value) {
    pendingDeleteId.value = id
    deleteConfirmUntil.value = now + 5000
    toast.info('Potvrď smazání', 'Klikni znovu do 5 sekund.')
    return
  }
  deletingId.value = id
  try {
    await $fetch(`/api/admin/products/${id}`, { method: 'DELETE' })
    await refresh()
    toast.success('Smazáno', 'Produkt odstraněn.')
  } catch (e: any) {
    toast.error('Chyba', e?.data?.statusMessage || e?.message || 'Nepodařilo se smazat.')
  } finally {
    pendingDeleteId.value = null
    deleteConfirmUntil.value = 0
    deletingId.value = null
  }
}

function getImageSrc(image: string) {
  if (!image) return ''
  // Absolute URLs and root-relative paths ("/uploads/…") are already valid.
  // Only bare paths need a leading slash — prepending it to "/uploads/…" made
  // "//uploads/…", which the browser reads as the host "uploads" → broken image.
  if (image.startsWith('http') || image.startsWith('/')) return image
  return `/${image}`
}
</script>

<template>
  <div>
    <div class="page-header">
      <div>
        <h1 class="page-title">Produkty</h1>
        <p class="page-subtitle">Katalog v shopiku</p>
      </div>
      <button class="btn-primary" @click="openCreate">
        <Icon name="lucide:plus" height="16" /> Přidat produkt
      </button>
    </div>

    <div class="filters-row">
      <div class="search-box">
        <Icon name="lucide:search" height="16" class="search-icon" />
        <input v-model="searchQuery" type="text" placeholder="Hledat produkty…" class="search-input" />
      </div>
      <select v-model="selectedCategory" class="filter-select">
        <option value="">Všechny kategorie</option>
        <option v-for="cat in allCategories" :key="cat.id" :value="cat.name">{{ cat.name }}</option>
      </select>
    </div>

    <p class="results-count" v-if="!pending">{{ filteredProducts.length }} produktů</p>

    <div v-if="pending" class="loading">
      <Icon name="lucide:loader-2" height="20" class="spin" /> Načítání…
    </div>

    <div v-else class="admin-card">
      <div class="table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Produkt</th>
              <th>Kategorie</th>
              <th>Cena</th>
              <th>Sklad</th>
              <th>Vytvořeno</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filteredProducts" :key="p.id">
              <td class="cell-primary">
                <div class="product-cell">
                  <div class="product-thumb">
                    <img v-if="p.image" :src="getImageSrc(p.image)" :alt="p.title" />
                    <Icon v-else name="lucide:image" height="18" />
                  </div>
                  <div>
                    <span class="product-name">{{ p.title }}</span>
                    <span class="product-id">#{{ p.productNumber || p.id }}</span>
                  </div>
                </div>
              </td>
              <td data-label="Kategorie">
                <span class="item-tag" v-if="p.category">{{ p.category }}</span>
              </td>
              <td class="price" data-label="Cena">{{ p.price.toLocaleString('cs-CZ') }} Kč</td>
              <td data-label="Sklad">
                <span :class="['stock-badge', p.stock <= 5 ? 'stock-low' : 'stock-ok']">{{ p.stock }}</span>
              </td>
              <td class="mono" data-label="Vytvořeno">{{ new Date(p.createdAt).toLocaleDateString('cs-CZ') }}</td>
              <td class="cell-actions">
                <div class="actions-cell">
                  <button class="action-btn" @click="openEdit(p)" title="Upravit">
                    <Icon name="lucide:pencil" height="14" />
                  </button>
                  <button
                    class="action-btn delete-btn"
                    @click="deleteProduct(p.id)"
                    :disabled="deletingId === p.id"
                    title="Smazat"
                  >
                    <Icon :name="deletingId === p.id ? 'lucide:loader-2' : 'lucide:trash-2'" height="14" :class="{ spin: deletingId === p.id }" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showModal" class="admin-modal-overlay" @click.self="showModal = false">
          <div class="admin-modal modal-lg">
            <div class="modal-header">
              <h3 class="modal-title">{{ isEditing ? 'Upravit produkt' : 'Nový produkt' }}</h3>
              <button @click="showModal = false" class="modal-close" aria-label="Zavřít">
                <Icon name="lucide:x" height="18" />
              </button>
            </div>

            <form @submit.prevent="saveProduct" class="modal-body">
              <div class="form-group">
                <label class="form-label">Název</label>
                <input v-model="form.title" type="text" class="form-input" required placeholder="Název produktu" />
              </div>
              <div class="form-group">
                <label class="form-label">Popis</label>
                <textarea v-model="form.description" class="form-input form-textarea" placeholder="Popis produktu"></textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Cena (Kč)</label>
                  <input v-model.number="form.price" type="number" class="form-input" required min="0" />
                </div>
                <div class="form-group">
                  <label class="form-label">Sklad</label>
                  <input v-model.number="form.stock" type="number" class="form-input" min="0" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Kategorie</label>
                <div v-if="form.categoryId" class="selected-cat">
                  <Icon name="lucide:check" height="14" />
                  <span>{{ getCategoryPath(form.categoryId) }}</span>
                  <button type="button" class="cat-clear" @click="form.categoryId = null; form.category = ''">
                    <Icon name="lucide:x" height="12" />
                  </button>
                </div>

                <div class="picker">
                  <div class="picker-crumbs">
                    <button type="button" class="crumb" @click="resetPicker">Vše</button>
                    <template v-for="(p, i) in pickerPath" :key="p.id">
                      <span class="crumb-sep">›</span>
                      <button type="button" class="crumb" @click="pickerPath = pickerPath.slice(0, i + 1)">
                        {{ p.name }}
                      </button>
                    </template>
                  </div>
                  <div class="picker-grid">
                    <div v-for="cat in currentLevelCategories" :key="cat.id" class="picker-row">
                      <button type="button" class="picker-btn" @click="selectLevel(cat)">
                        <span>{{ cat.name }}</span>
                        <Icon v-if="cat.children?.length" name="lucide:chevron-right" height="12" />
                      </button>
                      <button
                        type="button"
                        class="picker-del"
                        :class="{ 'is-armed': pendingDeleteCatId === cat.id }"
                        :title="`Smazat kategorii ${cat.name}`"
                        :aria-label="`Smazat kategorii ${cat.name}`"
                        @click.stop="deleteCategory(cat)"
                      >
                        <Icon :name="pendingDeleteCatId === cat.id ? 'lucide:check' : 'lucide:trash-2'" height="12" />
                      </button>
                    </div>
                    <div v-if="currentLevelCategories.length === 0" class="picker-empty">
                      Žádné podkategorie
                    </div>
                  </div>
                  <button
                    v-if="pickerPath.length > 0"
                    type="button"
                    class="picker-confirm"
                    @click="setFinalCategory(pickerPath[pickerPath.length - 1])"
                  >
                    <Icon name="lucide:check" height="14" />
                    Zvolit „{{ pickerPath[pickerPath.length - 1].name }}"
                  </button>

                  <!-- Inline new-category creator -->
                  <div class="new-cat">
                    <button v-if="!showNewCat" type="button" class="new-cat-toggle" @click="openNewCat">
                      <Icon name="lucide:plus" height="14" />
                      Přidat novou kategorii{{ newCatParent ? ` do „${newCatParent.name}"` : '' }}
                    </button>
                    <div v-else class="new-cat-form">
                      <div class="new-cat-label">
                        Nová kategorie {{ newCatParent ? `v „${newCatParent.name}"` : '(hlavní úroveň)' }}
                      </div>
                      <div class="new-cat-row">
                        <input
                          v-model="newCatName"
                          type="text"
                          class="form-input"
                          placeholder="Např. Náhrdelníky"
                          @keydown.enter.prevent="createCategory"
                          @keydown.esc.prevent="showNewCat = false"
                        />
                        <button type="button" class="btn-primary new-cat-save" :disabled="creatingCat || !newCatName.trim()" @click="createCategory">
                          <Icon :name="creatingCat ? 'lucide:loader-2' : 'lucide:check'" height="14" :class="{ spin: creatingCat }" />
                          Vytvořit
                        </button>
                        <button type="button" class="btn-ghost new-cat-cancel" @click="showNewCat = false">Zrušit</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Obrázky (max {{ MAX_IMAGES }})</label>
                <p class="images-note">
                  Každou fotku si nejdřív ořízneš v editoru na formát 5:4 — přesně tak,
                  jak se zobrazí na kartě produktu.
                </p>
                <div v-if="form.images.length > 0" class="images-grid">
                  <div
                    v-for="(img, index) in form.images"
                    :key="index"
                    :class="['image-tile', { 'is-thumb': form.image === img }]"
                    @click="setAsThumbnail(img)"
                  >
                    <img :src="getImageSrc(img)" alt="" />
                    <div v-if="form.image === img" class="thumb-tag">
                      <Icon name="lucide:star" height="10" /> Náhled
                    </div>
                    <button type="button" class="image-remove" @click.stop="removeImage(index)" aria-label="Odebrat">
                      <Icon name="lucide:x" height="10" />
                    </button>
                    <button
                      type="button"
                      class="image-edit"
                      :disabled="preparingEdit !== null"
                      @click.stop="editImage(index)"
                      aria-label="Upravit výřez"
                    >
                      <Icon
                        :name="preparingEdit === index ? 'lucide:loader-2' : 'lucide:crop'"
                        height="10"
                        :class="{ spin: preparingEdit === index }"
                      />
                      Upravit
                    </button>
                  </div>
                </div>

                <label v-if="form.images.length < MAX_IMAGES" class="upload-zone">
                  <Icon :name="uploading ? 'lucide:loader-2' : 'lucide:image-plus'" height="18" :class="{ spin: uploading }" />
                  <span>{{ uploading ? 'Nahrávání…' : 'Přidat obrázky' }}</span>
                  <span class="upload-hint">{{ form.images.length }}/{{ MAX_IMAGES }}</span>
                  <input type="file" accept="image/*" multiple class="upload-input" @change="handleImageUpload" :disabled="uploading" />
                </label>
                <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-ghost" @click="showModal = false">Zrušit</button>
                <button type="submit" class="btn-primary" :disabled="saving || uploading">
                  <Icon v-if="saving" name="lucide:loader-2" height="14" class="spin" />
                  {{ isEditing ? 'Uložit' : 'Vytvořit' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Photo editor — teleports itself above the product modal -->
    <ImageCropper
      v-if="cropQueue.length > 0"
      :files="cropQueue"
      :title="cropReplaceIndex !== null ? 'Upravit výřez fotky' : 'Úprava fotky'"
      @apply="onCropApply"
      @close="closeCropper"
    />
  </div>
</template>

<style scoped>
.loading {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--adx-vink-50);
  font-style: italic;
  font-family: var(--font-body);
  padding: 2rem 0;
}
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Category picker */
.selected-cat {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.8rem;
  background: var(--adx-accent-08);
  border: 1px solid var(--adx-accent-25);
  border-radius: 8px;
  color: var(--adx-vink);
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.65rem;
}
.cat-clear {
  margin-left: 0.35rem;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--adx-vink-55);
  padding: 0.15rem;
  border-radius: 4px;
  display: inline-flex;
}
.cat-clear:hover { background: var(--adx-vink-10); color: var(--adx-accent); }

.picker {
  background: var(--adx-surface-2);
  border: 1px solid var(--adx-vink-10);
  border-radius: 10px;
  overflow: hidden;
}
.picker-crumbs {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid var(--adx-vink-08);
  background: var(--adx-veil-45);
  font-size: 0.8rem;
}
.crumb {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--adx-vink-60);
  padding: 0;
}
.crumb:hover { color: var(--adx-vink); }
.crumb-sep { color: var(--adx-vink-30); }

.picker-row { display: flex; gap: 4px; align-items: stretch; }
.picker-row .picker-btn { flex: 1; }
.picker-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  border: 1px solid var(--adx-accent-35);
  border-radius: 8px;
  background: transparent;
  color: var(--adx-accent);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.picker-del:hover { background: var(--adx-accent-08); }
/* Armed = a solid rose fill, which stays saturated in both themes, so its
   glyph is the constant white --adx-on-accent and not the flipping ink. */
.picker-del.is-armed { background: var(--adx-accent-fill); color: var(--adx-on-accent); }

.picker-grid {
  padding: 0.45rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
  max-height: 240px;
  overflow-y: auto;
}
.picker-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.85rem;
  background: var(--adx-raised);
  border: 1px solid var(--adx-vink-08);
  border-radius: 7px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
  color: var(--adx-vink);
  text-align: left;
  font-weight: 500;
}
.picker-btn:hover { border-color: var(--adx-accent-40); background: var(--adx-accent-04); }
.picker-empty {
  grid-column: span 2;
  padding: 1.5rem;
  text-align: center;
  color: var(--adx-vink-50);
  font-style: italic;
  font-family: var(--font-body);
}
.picker-confirm {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  background: var(--adx-vink-fill);
  color: var(--adx-on-vink-fill);
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
}
.picker-confirm:hover { background: var(--adx-vink-fill-hover); }

/* Inline new-category creator */
.new-cat {
  border-top: 1px solid var(--adx-vink-08);
  padding: 0.5rem;
  background: var(--adx-veil-45);
}
.new-cat-toggle {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  background: transparent;
  border: 1.5px dashed var(--adx-accent-35);
  border-radius: 7px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--adx-accent);
  transition: all 0.15s ease;
}
.new-cat-toggle:hover { background: var(--adx-accent-06); border-color: var(--adx-accent); }
.new-cat-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--adx-vink-60);
  margin-bottom: 0.4rem;
}
.new-cat-row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.new-cat-row .form-input { flex: 1; margin: 0; }
.new-cat-save { white-space: nowrap; }
.new-cat-cancel { white-space: nowrap; }

/* Images grid */
.images-note {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  line-height: 1.4;
  color: var(--adx-vink-55);
  font-style: italic;
}
.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.image-tile {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer;
  background: var(--adx-surface-2);
}
.image-tile.is-thumb { border-color: var(--adx-accent); }
.image-tile img { width: 100%; height: 100%; object-fit: cover; }
.thumb-tag {
  position: absolute;
  bottom: 4px;
  left: 4px;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.12rem 0.4rem;
  background: var(--adx-veil-92);
  color: var(--adx-accent);
  font-size: 0.65rem;
  font-weight: 700;
  border-radius: 999px;
}
.image-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--adx-veil-90);
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--adx-accent);
}
.image-remove:hover { background: var(--adx-accent-fill); color: var(--adx-on-accent); }
/* Top-left: bottom-left is the "Náhled" tag and top-right the remove button. */
.image-edit {
  position: absolute;
  top: 4px;
  left: 4px;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.14rem 0.4rem;
  border-radius: 999px;
  background: var(--adx-veil-90);
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.63rem;
  font-weight: 700;
  color: var(--adx-accent);
}
.image-edit:hover:not(:disabled) { background: var(--adx-accent-fill); color: var(--adx-on-accent); }
.image-edit:disabled { opacity: 0.6; cursor: default; }

.upload-zone {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem 1.1rem;
  border: 1.5px dashed var(--adx-vink-18);
  border-radius: 10px;
  cursor: pointer;
  color: var(--adx-vink-65);
  font-size: 0.88rem;
  font-weight: 500;
  background: var(--adx-surface-2);
  transition: all 0.18s ease;
}
.upload-zone:hover { border-color: var(--adx-accent); color: var(--adx-accent); background: var(--adx-accent-05); }
.upload-hint { font-size: 0.72rem; color: var(--adx-vink-50); margin-left: auto; }
.upload-input { display: none; }
.upload-error {
  margin-top: 0.5rem;
  color: var(--adx-accent);
  font-size: 0.82rem;
  font-style: italic;
}
</style>
