const organizationService = require('../services/organization.service');
const { logger } = require('/shared');

class OrganizationController {
  // Tạo organization mới
  async createOrganization(req, res) {
    try {
      const { name, description, logo, settings } = req.body;
      const ownerId = req.user?.id || req.userContext?.userId;

      if (!name || !ownerId) {
        return res.status(400).json({
          success: false,
          message: 'name and ownerId are required',
        });
      }

      const organization = await organizationService.createOrganization({
        name,
        description,
        ownerId,
        logo,
        settings,
      });

      res.status(201).json({
        success: true,
        data: organization,
      });
    } catch (error) {
      logger.error('Create organization error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy organization theo ID
  async getOrganizationById(req, res) {
    try {
      const { organizationId } = req.params;
      const organization = await organizationService.getOrganizationById(organizationId);

      if (!organization) {
        return res.status(404).json({
          success: false,
          message: 'Organization not found',
        });
      }

      res.json({
        success: true,
        data: organization,
      });
    } catch (error) {
      logger.error('Get organization error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Cập nhật organization
  async updateOrganization(req, res) {
    try {
      const { organizationId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const organization = await organizationService.updateOrganization(
        organizationId,
        req.body,
        userId
      );

      res.json({
        success: true,
        data: organization,
      });
    } catch (error) {
      logger.error('Update organization error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa organization
  async deleteOrganization(req, res) {
    try {
      const { organizationId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const organization = await organizationService.deleteOrganization(
        organizationId,
        userId
      );

      res.json({
        success: true,
        message: 'Organization deleted successfully',
        data: organization,
      });
    } catch (error) {
      logger.error('Delete organization error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new OrganizationController();

