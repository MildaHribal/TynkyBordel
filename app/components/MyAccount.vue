<template>
  <div>
    <PageHero title="My Account" />
    <section class="section">
      <div class="container">
        <div class="columns">
          <div class="column is-3">
            <aside class="menu">
              <p class="menu-label">
                My Account
              </p>
              <ul class="menu-list">
                <li><a @click="activeTab = 'orders'" :class="{'is-active': activeTab === 'orders'}">My Orders</a></li>
                <li><a @click="activeTab = 'reviews'" :class="{'is-active': activeTab === 'reviews'}">My Reviews</a></li>
                <li><a @click="activeTab = 'personal-data'" :class="{'is-active': activeTab === 'personal-data'}">Personal Data</a></li>
                <li><a @click="activeTab = 'favorites'" :class="{'is-active': activeTab === 'favorites'}">Favorites</a></li>
                <li><a @click="activeTab = 'delivery-details'" :class="{'is-active': activeTab === 'delivery-details'}">Delivery Details</a></li>
              </ul>
            </aside>
          </div>
          <div class="column is-9">
            <div v-if="activeTab === 'orders'">
              <h2 class="title is-4">My Orders</h2>
              <!-- Content for My Orders -->
            </div>
            <div v-if="activeTab === 'reviews'">
              <h2 class="title is-4">My Reviews</h2>
              <!-- Content for My Reviews -->
            </div>
            <div v-if="activeTab === 'personal-data'">
              <h2 class="title is-4">Personal Data</h2>
              <!-- Content for Personal Data -->
            </div>
            <div v-if="activeTab === 'favorites'">
              <h2 class="title is-4">Favorites</h2>
              <!-- Content for Favorites -->
            </div>
            <div v-if="activeTab === 'delivery-details'">
              <h2 class="title is-4">Delivery Details</h2>
              <!-- Content for Delivery Details -->
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import PageHero from './PageHero.vue';

export default {
  name: 'MyAccount',
  components: {
    PageHero
  },
  data() {
    return {
      activeTab: 'orders' // Default active tab
    };
  }
};
</script>

<style scoped>
/* The active item is a raised sheet on the page ground, so it takes the sheet /
   ink pair and flips with the theme. Hardcoded #f5f5f5 + #363636 turned into
   near-white ink on a near-white fill as soon as --pop-ink inverted. */
.menu-list a.is-active {
  background-color: var(--pop-sheet-2, #F5F1EA);
  color: var(--pop-ink, #14231a);
}
</style>
