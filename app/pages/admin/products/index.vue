<script setup lang="ts">
import { Icon } from '@iconify/vue'

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
  showModal.value = true
}

async function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  const remaining = MAX_IMAGES - form.value.images.length
  if (remaining <= 0) { uploadError.value = `Maximálně ${MAX_IMAGES} obrázků`; return }
  const filesToUpload = Array.from(files).slice(0, remaining)
  uploading.value = true
  uploadError.value = ''
  try {
    for (const file of filesToUpload) {
      const formData = new FormData()
      formData.append('file', file)
      const result = await $fetch<{ url: string }>('/api/admin/upload', { method: 'POST', body: formData })
      form.value.images.push(result.url)
      if (!form.value.image) form.value.image = result.url
    }
  } catch (e: any) {
    uploadError.value = e.data?.message || e.message || 'Chyba při nahrávání'
  } finally {
    uploading.value = false
    input.value = ''
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
        <Icon icon="lucide:plus" height="16" /> Přidat produkt
      </button>
    </div>

    <div class="filters-row">
      <div class="search-box">
        <Icon icon="lucide:search" height="16" class="search-icon" />
        <input v-model="searchQuery" type="text" placeholder="Hledat produkty…" class="search-input" />
      </div>
      <select v-model="selectedCategory" class="filter-select">
        <option value="">Všechny kategorie</option>
        <option v-for="cat in allCategories" :key="cat.id" :value="cat.name">{{ cat.name }}</option>
      </select>
    </div>

    <p class="results-count" v-if="!pending">{{ filteredProducts.length }} produktů</p>

    <div v-if="pending" class="loading">
      <Icon icon="lucide:loader-2" height="20" class="spin" /> Načítání…
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
              <td>
                <div class="product-cell">
                  <div class="product-thumb">
                    <img v-if="p.image" :src="getImageSrc(p.image)" :alt="p.title" />
                    <Icon v-else icon="lucide:image" height="18" />
                  </div>
                  <div>
                    <span class="product-name">{{ p.title }}</span>
                    <span class="product-id">#{{ p.id }}</span>
                  </div>
                </div>
              </td>
              <td>
                <span class="item-tag" v-if="p.category">{{ p.category }}</span>
              </td>
              <td class="price">{{ p.price.toLocaleString('cs-CZ') }} Kč</td>
              <td>
                <span :class="['stock-badge', p.stock <= 5 ? 'stock-low' : 'stock-ok']">{{ p.stock }}</span>
              </td>
              <td class="mono">{{ new Date(p.createdAt).toLocaleDateString('cs-CZ') }}</td>
              <td>
                <div class="actions-cell">
                  <button class="action-btn" @click="openEdit(p)" title="Upravit">
                    <Icon icon="lucide:pencil" height="14" />
                  </button>
                  <button
                    class="action-btn delete-btn"
                    @click="deleteProduct(p.id)"
                    :disabled="deletingId === p.id"
                    title="Smazat"
                  >
                    <Icon :icon="deletingId === p.id ? 'lucide:loader-2' : 'lucide:trash-2'" height="14" :class="{ spin: deletingId === p.id }" />
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
                <Icon icon="lucide:x" height="18" />
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
                  <Icon icon="lucide:check" height="14" />
                  <span>{{ getCategoryPath(form.categoryId) }}</span>
                  <button type="button" class="cat-clear" @click="form.categoryId = null; form.category = ''">
                    <Icon icon="lucide:x" height="12" />
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
                    <button
                      v-for="cat in currentLevelCategories"
                      :key="cat.id"
                      type="button"
                      class="picker-btn"
                      @click="selectLevel(cat)"
                    >
                      <span>{{ cat.name }}</span>
                      <Icon v-if="cat.children?.length" icon="lucide:chevron-right" height="12" />
                    </button>
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
                    <Icon icon="lucide:check" height="14" />
                    Zvolit „{{ pickerPath[pickerPath.length - 1].name }}"
                  </button>

                  <!-- Inline new-category creator -->
                  <div class="new-cat">
                    <button v-if="!showNewCat" type="button" class="new-cat-toggle" @click="openNewCat">
                      <Icon icon="lucide:plus" height="14" />
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
                          <Icon :icon="creatingCat ? 'lucide:loader-2' : 'lucide:check'" height="14" :class="{ spin: creatingCat }" />
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
                <div v-if="form.images.length > 0" class="images-grid">
                  <div
                    v-for="(img, index) in form.images"
                    :key="index"
                    :class="['image-tile', { 'is-thumb': form.image === img }]"
                    @click="setAsThumbnail(img)"
                  >
                    <img :src="getImageSrc(img)" alt="" />
                    <div v-if="form.image === img" class="thumb-tag">
                      <Icon icon="lucide:star" height="10" /> Náhled
                    </div>
                    <button type="button" class="image-remove" @click.stop="removeImage(index)" aria-label="Odebrat">
                      <Icon icon="lucide:x" height="10" />
                    </button>
                  </div>
                </div>

                <label v-if="form.images.length < MAX_IMAGES" class="upload-zone">
                  <Icon :icon="uploading ? 'lucide:loader-2' : 'lucide:image-plus'" height="18" :class="{ spin: uploading }" />
                  <span>{{ uploading ? 'Nahrávání…' : 'Přidat obrázky' }}</span>
                  <span class="upload-hint">{{ form.images.length }}/{{ MAX_IMAGES }}</span>
                  <input type="file" accept="image/*" multiple class="upload-input" @change="handleImageUpload" :disabled="uploading" />
                </label>
                <p v-if="uploadError" class="upload-error">{{ uploadError }}</p>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-ghost" @click="showModal = false">Zrušit</button>
                <button type="submit" class="btn-primary" :disabled="saving || uploading">
                  <Icon v-if="saving" icon="lucide:loader-2" height="14" class="spin" />
                  {{ isEditing ? 'Uložit' : 'Vytvořit' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.loading {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: rgba(42, 19, 64, 0.5);
  font-style: italic;
  font-family: 'Petrona', Georgia, serif;
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
  background: rgba(179, 50, 76, 0.08);
  border: 1px solid rgba(179, 50, 76, 0.25);
  border-radius: 8px;
  color: #2a1340;
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.65rem;
}
.cat-clear {
  margin-left: 0.35rem;
  background: transparent;
  border: none;
  cursor: pointer;
  color: rgba(42, 19, 64, 0.55);
  padding: 0.15rem;
  border-radius: 4px;
  display: inline-flex;
}
.cat-clear:hover { background: rgba(42, 19, 64, 0.1); color: #b3324c; }

.picker {
  background: #FAF1F4;
  border: 1px solid rgba(42, 19, 64, 0.1);
  border-radius: 10px;
  overflow: hidden;
}
.picker-crumbs {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid rgba(42, 19, 64, 0.08);
  background: rgba(255, 255, 255, 0.45);
  font-size: 0.8rem;
}
.crumb {
  background: transparent;
  border: none;
  cursor: pointer;
  color: rgba(42, 19, 64, 0.6);
  padding: 0;
}
.crumb:hover { color: #2a1340; }
.crumb-sep { color: rgba(42, 19, 64, 0.3); }

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
  background: #fff;
  border: 1px solid rgba(42, 19, 64, 0.08);
  border-radius: 7px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
  color: #2a1340;
  text-align: left;
  font-weight: 500;
}
.picker-btn:hover { border-color: rgba(179, 50, 76, 0.4); background: rgba(179, 50, 76, 0.04); }
.picker-empty {
  grid-column: span 2;
  padding: 1.5rem;
  text-align: center;
  color: rgba(42, 19, 64, 0.5);
  font-style: italic;
  font-family: 'Petrona', Georgia, serif;
}
.picker-confirm {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  background: #2a1340;
  color: #fff;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
}
.picker-confirm:hover { background: #3a1f55; }

/* Inline new-category creator */
.new-cat {
  border-top: 1px solid rgba(42, 19, 64, 0.08);
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.45);
}
.new-cat-toggle {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  background: transparent;
  border: 1.5px dashed rgba(179, 50, 76, 0.35);
  border-radius: 7px;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: #b3324c;
  transition: all 0.15s ease;
}
.new-cat-toggle:hover { background: rgba(179, 50, 76, 0.06); border-color: #b3324c; }
.new-cat-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(42, 19, 64, 0.6);
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
  background: #FAF1F4;
}
.image-tile.is-thumb { border-color: #b3324c; }
.image-tile img { width: 100%; height: 100%; object-fit: cover; }
.thumb-tag {
  position: absolute;
  bottom: 4px;
  left: 4px;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.12rem 0.4rem;
  background: rgba(255, 255, 255, 0.92);
  color: #b3324c;
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
  background: rgba(255, 255, 255, 0.9);
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #b3324c;
}
.image-remove:hover { background: #b3324c; color: #fff; }

.upload-zone {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.8rem 1.1rem;
  border: 1.5px dashed rgba(42, 19, 64, 0.18);
  border-radius: 10px;
  cursor: pointer;
  color: rgba(42, 19, 64, 0.65);
  font-size: 0.88rem;
  font-weight: 500;
  background: #FAF1F4;
  transition: all 0.18s ease;
}
.upload-zone:hover { border-color: #b3324c; color: #b3324c; background: rgba(179, 50, 76, 0.05); }
.upload-hint { font-size: 0.72rem; color: rgba(42, 19, 64, 0.5); margin-left: auto; }
.upload-input { display: none; }
.upload-error {
  margin-top: 0.5rem;
  color: #b3324c;
  font-size: 0.82rem;
  font-style: italic;
}
</style>
